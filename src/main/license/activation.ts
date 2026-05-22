import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import { generateMachineId } from './fingerprint';
import { firebaseConfig } from './firebase-config';

const DB_URL = firebaseConfig.databaseURL.replace(/\/$/, '');

function httpsRequest(method: string, url: string, body?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'object' && parsed.error) {
            reject(new Error(`Firebase error: ${parsed.error}`));
          } else {
            resolve(parsed);
          }
        } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function dbGet(key: string): Promise<any> {
  // Encode hyphens since Firebase RTDB path segments don't support them
  const safeKey = key.replace(/-/g, '_');
  return httpsRequest('GET', `${DB_URL}/licenses/${safeKey}.json`);
}

async function dbPatch(key: string, record: Record<string, any>): Promise<void> {
  const safeKey = key.replace(/-/g, '_');
  await httpsRequest('PATCH', `${DB_URL}/licenses/${safeKey}.json`, JSON.stringify(record));
}

const TRIAL_DIR = 'C:\\ProgramData\\TomXtractor';
const LICENSE_FILE = path.join(TRIAL_DIR, 'license.dat');
const ENC_KEY = 'TX49JA-ENCRYPTION-KEY-2024-SECURE';

function encrypt(text: string): string {
  const key = crypto.scryptSync(ENC_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export async function activateLicense(licenseKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const keyPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!keyPattern.test(licenseKey.toUpperCase())) {
      return { success: false, message: 'Invalid license key format. Expected: XXXX-XXXX-XXXX-XXXX' };
    }

    const machineId = await generateMachineId();
    const key = licenseKey.toUpperCase();

    const doc = await dbGet(key);

    if (!doc) {
      return { success: false, message: 'Invalid license key. Please check your key or contact support.' };
    }

    if (doc.status === 'revoked') {
      return { success: false, message: 'This license key has been revoked. Please contact support.' };
    }

    if (doc.status === 'active' && doc.machine_id && doc.machine_id !== machineId) {
      return { success: false, message: 'This license key is already locked to another machine.' };
    }

    if (doc.status === 'available' && doc.machine_id && doc.machine_id !== machineId) {
      return { success: false, message: 'This license key was generated for a different machine.' };
    }

    const activatedAt = new Date().toISOString();
    let expiresAt: string | null = null;
    if (doc.duration_days) {
      const d = new Date();
      d.setDate(d.getDate() + Number(doc.duration_days));
      expiresAt = d.toISOString();
    }

    await dbPatch(key, {
      machine_id: machineId,
      status: 'active',
      activated_at: activatedAt,
      expires_at: expiresAt,
    });

    if (!fs.existsSync(TRIAL_DIR)) fs.mkdirSync(TRIAL_DIR, { recursive: true });
    fs.writeFileSync(LICENSE_FILE, encrypt(JSON.stringify({
      activated: true, key, machineId, activatedAt, expiresAt,
    })), 'utf-8');

    return { success: true, message: 'License activated successfully!' };
  } catch (err: any) {
    return { success: false, message: `Activation failed: ${err.message}` };
  }
}
