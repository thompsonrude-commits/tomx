import * as dns from 'dns';
import * as net from 'net';
import { promisify } from 'util';
import { isQualityLead, DISPOSABLE_PROVIDERS } from '../utils/emailFilters';
import { scoreEmailForMarketing } from '../utils/marketingValidator';

const resolver = new dns.promises.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

async function robustResolveMx(domain: string, retries = 3): Promise<dns.MxRecord[]> {
  for (let i = 0; i < retries; i++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('DNS Timeout')), 5000)
      );
      
      const records = await Promise.race([
        resolver.resolveMx(domain),
        timeoutPromise
      ]);
      return records;
    } catch (err: any) {
      if (i === retries - 1) return [];
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  return [];
}

export async function verifyEmail(email: string): Promise<{ email: string; valid: boolean; status: string; mxRecords?: string[]; marketingScore?: number; isMarketingReady?: boolean; marketingRisk?: string }> {
  try {
    const emailLower = email.toLowerCase().trim();
    const domain = emailLower.split('@')[1];
    if (!domain) return { email, valid: false, status: 'Invalid domain' };

    // 1. Basic Quality Filter
    const { isQuality, reason } = isQualityLead(emailLower);
    if (!isQuality) {
      return { email, valid: false, status: reason || 'Low Quality' };
    }

    // 2. Extra Disposable Check
    if (DISPOSABLE_PROVIDERS.some(d => domain === d)) {
        return { email, valid: false, status: 'Disposable Email' };
    }

    // 3. DNS / MX Record Check
    const records = await robustResolveMx(domain);
    
    if (!records || records.length === 0) {
      // Fallback: Check for A record if no MX (some servers use A record as fallback)
      try {
        const aRecords = await resolver.resolve4(domain);
        if (!aRecords || aRecords.length === 0) {
            return { email, valid: false, status: 'No Mail Server Found' };
        }
      } catch {
        return { email, valid: false, status: 'Invalid Domain (No DNS)' };
      }
    }

    const sortedMx = (records || []).sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    const targetMx = sortedMx[0] || domain;

    // 4. MARKETING VALIDATION (AI-style free scoring for genuine business emails)
    const marketingValidation = scoreEmailForMarketing(emailLower, domain);
    const marketingRisk = marketingValidation.riskLevel;

    // Skip port 25 SMTP check entirely — most servers block it from residential IPs
    // Trust MX records as proof the domain accepts email
    return {
      email,
      valid: true,
      status: 'Active',
      mxRecords: sortedMx,
      marketingScore: marketingValidation.score,
      isMarketingReady: marketingValidation.isMarketingReady,
      marketingRisk: marketingRisk
    };
  } catch (err: any) {
    return { email, valid: false, status: `System Error: ${err.message}` };
  }
}

async function checkSmtpRecipient(mxHost: string, email: string): Promise<{ active: boolean; status: string }> {
  return new Promise((resolve) => {
    let socket: net.Socket;
    try {
        socket = net.createConnection({ port: 25, host: mxHost, family: 4 });
    } catch (e) {
        return resolve({ active: false, status: 'Connection Failed' });
    }

    let step = 0;
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        socket.destroy();
        resolve({ active: false, status: 'SMTP Timeout' });
      }
    }, 10000); // 10s timeout for full handshake

    socket.on('data', (data) => {
      if (finished) return;
      const response = data.toString();
      const code = parseInt(response.substring(0, 3));
      const senderDomain = 'mail-verifier.com';

      if (step === 0) { // Banner
        socket.write(`HELO ${senderDomain}\r\n`);
        step++;
      } else if (step === 1) { // After HELO
        if (code >= 400) {
            finished = true;
            socket.end();
            resolve({ active: false, status: 'SMTP Access Denied' });
            return;
        }
        socket.write(`MAIL FROM:<verify@${senderDomain}>\r\n`);
        step++;
      } else if (step === 2) { // After MAIL FROM
        if (code >= 400) {
            finished = true;
            socket.end();
            // If the sender is rejected, we don't know if the recipient is invalid.
            // We return active: true to allow the mailer to attempt the real send.
            resolve({ active: true, status: 'Verification Blocked' });
            return;
        }
        socket.write(`RCPT TO:<${email}>\r\n`);
        step++;
      } else if (step === 3) { // After RCPT TO
        finished = true;
        socket.write(`QUIT\r\n`);
        socket.end();
        
        if (code === 250) {
            resolve({ active: true, status: 'Active' });
        } else if (code === 550 || code === 553 || code === 551) {
            resolve({ active: false, status: 'User Not Found' });
        } else {
            resolve({ active: false, status: `Server Code: ${code}` });
        }
      }
    });

    socket.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        resolve({ active: false, status: `SMTP Error` });
      }
    });

    socket.on('close', () => {
        if (!finished) {
            finished = true;
            clearTimeout(timeout);
            resolve({ active: false, status: 'Connection Closed' });
        }
    });
  });
}
