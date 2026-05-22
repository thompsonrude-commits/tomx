import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs';
import { ExtractionEngine } from '../crawler/engine';
import * as db from '../db/database';
import { exportToCSV, exportToTXT, exportToXLSX } from '../export/exporter';
import { checkTrialStatus, getTrialInfo } from '../license/trial';
import { generateMachineId } from '../license/fingerprint';
import { activateLicense } from '../license/activation';
import { verifyEmail } from '../email/verifier';
import { emailMailer } from '../email/mailer';
import { fetchFreeProxies } from '../crawler/proxyFetcher';
import { checkDomainDeliverability } from '../utils/emailValidator';

const engine = new ExtractionEngine();

// Quick proxy health test — returns only alive proxies
async function quickTestProxies(proxies: string[]): Promise<string[]> {
  const http = require('http');
  const alive: string[] = [];
  
  const testOne = (proxy: string): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const clean = proxy.replace(/^https?:\/\//, '');
        let host: string, port: number;
        if (clean.includes('@')) {
          const afterAt = clean.substring(clean.lastIndexOf('@') + 1);
          [host] = afterAt.split(':');
          port = parseInt(afterAt.split(':')[1]) || 8080;
        } else {
          const parts = clean.split(':');
          host = parts[0];
          port = parseInt(parts[1]) || 8080;
        }
        const headers: Record<string, string> = { Host: 'www.google.com' };
        if (clean.includes('@')) {
          const authPart = clean.split('@')[0];
          headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(authPart).toString('base64');
        }
        const req = http.request({ host, port, method: 'GET', path: 'http://www.google.com/', headers, timeout: 6000 }, (res: any) => {
          req.destroy();
          resolve((res.statusCode || 0) > 0);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      } catch {
        resolve(false);
      }
    });
  };
  
  // Test in batches of 10
  for (let i = 0; i < proxies.length; i += 10) {
    const batch = proxies.slice(i, i + 10);
    const results = await Promise.all(batch.map(p => testOne(p)));
    
    batch.forEach((proxy, idx) => {
      if (results[idx]) {
        alive.push(proxy);
        db.updateProxyStatus(proxy, true, 0);
      } else {
        db.updateProxyStatus(proxy, false, 0);
      }
    });
  }
  
  return alive;
}

export function registerIpcHandlers() {
  // Extraction
  ipcMain.handle('start-extraction', async (_event, config) => {
    const finalConfig = { ...config };
    if (config.proxyMode === 'rotating') {
      // Pre-crawl proxy health check: verify proxies are actually alive
      let proxies = db.getWorkingProxies();
      
      if (proxies.length > 0) {
        db.addLog(`Testing ${proxies.length} stored proxies before crawl...`, 'info');
        const liveProxies = await quickTestProxies(proxies);
        // Delete any that failed — keep pool 100% clean
        db.deleteFailedProxies();
        
        if (liveProxies.length === 0) {
          db.addLog('All stored proxies are dead. Fetching fresh proxies...', 'warning');
          await fetchFreeProxies();
          const allProxies = db.getProxies().map((p: any) => p.address);
          const freshLive = await quickTestProxies(allProxies.slice(0, 30));
          db.deleteFailedProxies();
          proxies = freshLive;
        } else {
          proxies = liveProxies;
        }
      } else {
        // No working proxies at all — fetch fresh ones
        db.addLog('No proxies found. Fetching fresh free proxies...', 'info');
        await fetchFreeProxies();
        const allProxies = db.getProxies().map((p: any) => p.address);
        proxies = await quickTestProxies(allProxies.slice(0, 30));
        db.deleteFailedProxies();
      }

      if (proxies.length > 0) {
        db.addLog(`${proxies.length} live proxies ready for rotating engine`, 'success');
      } else {
        db.addLog('No live proxies available — starting engine with direct connection', 'warning');
      }
      finalConfig.proxies = proxies;
    } else {
      db.addLog('Starting extraction in direct mode (No proxies)', 'info');
    }
    
    const win = BrowserWindow.getAllWindows()[0];
    engine.removeAllListeners('event');
    engine.on('event', (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('extraction-event', data);
      }
    });

    db.addLog(`Initializing extraction engine with ${config.threads} threads...`, 'info');
    engine.start(finalConfig);
  });

  ipcMain.handle('pause-extraction', async () => { engine.pause(); });
  ipcMain.handle('stop-extraction', async () => { 
    engine.stop(); 
    db.forceSave();
  });

  // Stats
  ipcMain.handle('get-stats', async () => {
    const stats = db.getStats();
    stats.activeJobs = engine.isRunning() ? 1 : 0;
    stats.isMailerRunning = emailMailer.isRunning();
    return stats;
  });

  ipcMain.handle('get-emails', async (_event, filters) => db.getEmails(filters));
  ipcMain.handle('get-email-count', async (_event, filters) => db.getEmailCount(filters));
  ipcMain.handle('get-domains', async () => db.getDomains());
  ipcMain.handle('get-logs', async () => db.getLogs());

  // Export
  ipcMain.handle('export-data', async (_event, format, options) => {
    const win = BrowserWindow.getAllWindows()[0];
    const saveResult = await dialog.showSaveDialog(win, {
      defaultPath: `extracted_emails.${format}`,
      filters: [
        { name: format.toUpperCase(), extensions: [format] },
      ],
    });
    if (saveResult.canceled || !saveResult.filePath) return null;
    const emails = db.getAllEmailsForExport(options?.filterStatus);
    switch (format) {
      case 'csv': await exportToCSV(emails, saveResult.filePath, options); break;
      case 'txt': await exportToTXT(emails, saveResult.filePath, options); break;
      case 'xlsx': await exportToXLSX(emails, saveResult.filePath, options); break;
    }
    return saveResult.filePath;
  });

  // Email verification
  ipcMain.handle('verify-emails', async (_event, emails: string[]) => {
    return Promise.all(emails.map(async (email) => {
      const res = await verifyEmail(email);
      db.updateEmailStatus(email, res.status);
      return res;
    }));
  });

  // Proxy
  ipcMain.handle('get-proxies', async () => db.getProxies());
  ipcMain.handle('add-proxy', async (_event, address) => db.addProxy(address));
  ipcMain.handle('delete-proxy', async (_event, id) => db.deleteProxy(id));
  ipcMain.handle('update-proxy-status', async (_event, { address, working, latency }) => 
    db.updateProxyStatus(address, working, latency));
  ipcMain.handle('get-working-proxies', async () => db.getWorkingProxies());
  ipcMain.handle('fetch-free-proxies', async () => fetchFreeProxies());
  
  ipcMain.handle('proxy-test', async (_event, proxy) => {
    const start = Date.now();
    const http = require('http');
    const clean = proxy.replace(/^https?:\/\//, '');
    let host: string, port: number;
    if (clean.includes('@')) {
      const afterAt = clean.substring(clean.lastIndexOf('@') + 1);
      [host] = afterAt.split(':');
      port = parseInt(afterAt.split(':')[1]) || 8080;
    } else {
      const parts = clean.split(':');
      host = parts[0];
      port = parseInt(parts[1]) || 8080;
    }
    const headers: Record<string, string> = { Host: 'www.google.com' };
    if (clean.includes('@')) {
      headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(clean.split('@')[0]).toString('base64');
    }
    const working: boolean = await new Promise((resolve) => {
      try {
        const req = http.request({ host, port, method: 'GET', path: 'http://www.google.com/', headers, timeout: 6000 }, (res: any) => {
          req.destroy();
          resolve((res.statusCode || 0) > 0);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      } catch { resolve(false); }
    });
    const latency = Date.now() - start;
    db.updateProxyStatus(proxy, working, latency);
    if (!working) db.deleteFailedProxies();
    return { proxy, working, latency };
  });

  // License
  ipcMain.handle('check-license', async () => {
    const trial = getTrialInfo();
    const machineId = await generateMachineId();
    return { ...trial, machineId };
  });

  ipcMain.handle('activate-license', async (_event, key) => activateLicense(key));
  ipcMain.handle('get-machine-id', async () => generateMachineId());

  // Interactive Browser
  ipcMain.handle('add-manual-emails', async (_event, { emails, sourcePage, domain }) => {
    let foundCount = 0;
    for (const email of emails) {
      const emailDomain = email.split('@')[1];
      if (!emailDomain) continue;
      
      const isDeliverable = await checkDomainDeliverability(emailDomain);
      if (!isDeliverable) continue;

      if (db.addEmail(email, domain, sourcePage)) {
        foundCount++;
      }
    }
    return foundCount;
  });

  // Data management
  ipcMain.handle('purge-junk-emails', async () => db.purgeJunkEmails());
  ipcMain.handle('clear-emails', async () => db.clearEmails());
  ipcMain.handle('clear-logs', async () => db.clearLogs());
  ipcMain.handle('reset-database', async () => db.resetDatabase());
  ipcMain.handle('delete-email', async (_event, id) => db.deleteEmail(id));
  ipcMain.handle('delete-emails-by-status', async (_event, status) => db.deleteEmailsByStatus(status));

  // File dialog
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Text Files', extensions: ['txt', 'csv'] }] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('save-file-dialog', async (_event, defaultName) => {
    const result = await dialog.showSaveDialog({ defaultPath: defaultName });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('import-emails-from-file', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Email Lists', extensions: ['txt', 'csv'] }]
    });
    if (canceled || filePaths.length === 0) return 0;
    
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    let emails: string[] = [];

    if (filePath.endsWith('.csv')) {
      const { parse } = await import('fast-csv');
      const rows: any[] = [];
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(parse({ headers: true, ignoreEmpty: true }))
          .on('data', (row) => rows.push(row))
          .on('error', reject)
          .on('end', resolve);
      });
      
      // Look for common email column names
      const emailKeys = ['email', 'address', 'mail', 'e-mail'];
      emails = rows.map(row => {
        const key = Object.keys(row).find(k => emailKeys.includes(k.toLowerCase()));
        return key ? row[key] : Object.values(row)[0];
      }).filter(e => typeof e === 'string' && e.includes('@'));
    } else {
      // TXT parsing
      emails = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.includes('@'));
    }

    let addedCount = 0;
    for (const email of emails) {
      const domain = email.split('@')[1] || 'imported';
      if (db.addEmail(email, domain, 'imported-file')) {
        addedCount++;
      }
    }
    return addedCount;
  });

  // Mailer
  ipcMain.handle('get-smtps', async () => db.getSmtps());
  ipcMain.handle('add-smtp', async (_event, smtp) => db.addSmtp(smtp));
  ipcMain.handle('delete-smtp', async (_event, id) => db.deleteSmtp(id));
  ipcMain.handle('clear-smtps', async () => db.clearSmtps());
  ipcMain.handle('clear-mailing-logs', async () => db.clearMailingLogs());
  ipcMain.handle('test-smtp', async (_event, smtp) => emailMailer.testSmtp(smtp));
  ipcMain.handle('get-mailing-logs', async () => db.getMailingLogs());
  ipcMain.handle('get-mailing-settings', async () => db.getMailingSettings());
  ipcMain.handle('save-mailing-setting', async (_event, { key, value }) => db.saveMailingSetting(key, value));
  
  ipcMain.handle('start-mailing', async (_event, config: any) => {
    const win = BrowserWindow.getAllWindows()[0];
    emailMailer.removeAllListeners('event');
    emailMailer.on('event', (data: any) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('mailing-event', data);
      }
    });
    return emailMailer.start(config);
  });
  
  ipcMain.handle('stop-mailing', async () => emailMailer.stop());

  // Export campaign report CSV
  ipcMain.handle('export-campaign-report', async (_event, reportPath: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    const saveResult = await dialog.showSaveDialog(win, {
      defaultPath: `campaign_report_${Date.now()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (saveResult.canceled || !saveResult.filePath) return null;
    fs.copyFileSync(reportPath, saveResult.filePath);
    return saveResult.filePath;
  });
}
