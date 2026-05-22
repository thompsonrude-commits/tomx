import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import { generateMachineId } from '../main/license/fingerprint';
import { firebaseConfig } from '../main/license/firebase-config';

const DB_URL = firebaseConfig.databaseURL.replace(/\/$/, '');

// ── Realtime Database REST helpers (pure Node https) ─────────────────────────

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
          // Firebase returns {"error": "..."} on failure
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

async function dbSet(key: string, record: Record<string, any>): Promise<void> {
  const safeKey = key.replace(/-/g, '_');
  await httpsRequest('PUT', `${DB_URL}/licenses/${safeKey}.json`, JSON.stringify(record));
}

async function dbPatch(key: string, record: Record<string, any>): Promise<void> {
  const safeKey = key.replace(/-/g, '_');
  await httpsRequest('PATCH', `${DB_URL}/licenses/${safeKey}.json`, JSON.stringify(record));
}

async function dbDelete(key: string): Promise<void> {
  const safeKey = key.replace(/-/g, '_');
  await httpsRequest('DELETE', `${DB_URL}/licenses/${safeKey}.json`);
}

async function dbListAll(): Promise<any[]> {
  const data = await httpsRequest('GET', `${DB_URL}/licenses.json`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data).map(([k, v]: [string, any]) => {
    const record = { ...v };
    // Restore hyphenated key — stored field takes priority, fallback to node name
    if (!record.key) record.key = k.replace(/_/g, '-');
    return record;
  });
}

// ── Key generation helpers ────────────────────────────────────────────────────

const LICENSE_SECRET = 'TX49JA-LICENSE-SECRET';
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRandomKey(): string {
  const seg = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

function generateMachineKey(machineId: string): string {
  const hash = crypto.createHmac('sha256', LICENSE_SECRET).update(machineId).digest();
  let key = '';
  for (let i = 0; i < 16; i++) {
    key += CHARS[hash[i] % CHARS.length];
    if ((i + 1) % 4 === 0 && i < 15) key += '-';
  }
  return key;
}

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900, height: 680, resizable: true, frame: true,
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(__dirname, 'admin-preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../resources/icon.ico'),
  });
  mainWindow.setMenu(null);
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5174');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('generate-key', async (_e, machineId: string, durationDays?: number) => {
  if (!machineId.trim()) return { success: false, message: 'Machine ID is required' };
  try {
    const key = generateMachineKey(machineId);
    const existing = await dbGet(key);
    if (!existing) {
      await dbSet(key, {
        key, status: 'available', machine_id: machineId,
        duration_days: durationDays ?? null,
        created_at: new Date().toISOString(),
        activated_at: null, expires_at: null,
      });
    }
    return { success: true, key };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('sync-keys', async (_e, count: number = 10, durationDays?: number) => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      const key = generateRandomKey();
      await dbSet(key, {
        key, status: 'available', machine_id: null,
        duration_days: durationDays ?? null,
        created_at: new Date().toISOString(),
        activated_at: null, expires_at: null,
      });
      keys.push(key);
    }
    return { success: true, keys, message: `Successfully generated and uploaded ${count} serial keys.` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-machine-id', async () => generateMachineId());

ipcMain.handle('list-keys', async () => {
  try {
    const data = await dbListAll();
    data.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { success: true, data };
  } catch (err: any) {
    return { success: false, message: err.message, data: [] };
  }
});

ipcMain.handle('revoke-key', async (_e, key: string) => {
  try {
    await dbPatch(key, { status: 'revoked', machine_id: null });
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('restore-key', async (_e, key: string) => {
  try {
    await dbPatch(key, { status: 'available', machine_id: null, activated_at: null });
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('delete-key', async (_e, key: string) => {
  try {
    await dbDelete(key);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('purge-keys', async () => {
  try {
    await httpsRequest('DELETE', `${DB_URL}/licenses.json`);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
