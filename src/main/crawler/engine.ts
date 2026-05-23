import puppeteer, { Browser, Page } from 'puppeteer-core';
import { EventEmitter } from 'events';
import { addEmail, addDomain, incrementDomainPages, addLog, updateProxyStatus, deleteFailedProxies } from '../db/database';
import { scoreEmailForMarketing } from '../utils/marketingValidator';
// @ts-ignore
import pdf from 'pdf-parse';
import * as ExcelJS from 'exceljs';
import axios from 'axios';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const unzipper: any = require('unzipper');
import * as fastCsv from 'fast-csv';

const EMAIL_REGEX = /[a-zA-Z0-9._%\-+]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3}[-.\s]?\d{4,9}/g;

const BLACKLIST = [
  'example.com','sentry.io', 'wixpress.com','w3.org','schema.org','googleapis.com',
  'facebook.com','twitter.com','google.com','wordpress.org','gravatar.com','jquery.com',
  'duckduckgo.com', 'bing.com', 'microsoft.com', 'youtube.com', 'messenger.com',
  'instagram.com', 'linkedin.com'
];

const ASSET_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.zip', '.rar', '.exe', '.css', '.js', '.mp4', '.mp3'];
const DOC_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.rtf'];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

const BUSINESS_ROLES = [
  'info', 'admin', 'support', 'sales', 'contact', 'office', 'webmaster', 'noreply',
  'hr', 'jobs', 'billing', 'help', 'marketing', 'press', 'media', 'enquiry',
  'reservations', 'book', 'team', 'staff', 'hello', 'mail', 'postmaster',
  'account', 'accounts', 'service', 'services', 'feedback', 'queries'
];

const GOV_EXTENSIONS = ['.gov', '.mil', '.gov.ng', '.gov.uk', '.gov.au', '.gov.ca', '.gov.za'];

const UNIVERSAL_PERSONAL_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com',
  'msn.com', 'live.com', 'ymail.com', 'rocketmail.com', 'mail.com', 'gmx.com',
  'zoho.com', 'yandex.com', 'yandex.ru', 'rambler.ru', 'mail.ru', 'protonmail.com',
  'me.com', 'qq.com', '163.com', 'sina.com', 'rediffmail.com', 'fastmail.com',
  'btinternet.com', 'virginmedia.com', 'blueyonder.co.uk', 'talktalk.net', 'sky.com',
  'web.de', 'gmx.net', 't-online.de', 'freenet.de', 'libero.it', 'virgilio.it', 'alice.it',
  'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net',
  'cox.net', 'verizon.net', 'att.net', 'comcast.net', 'earthlink.net'
];

interface CrawlConfig {
  keywords: string[];
  location?: string;
  threads: number;
  depth: number;
  timeout: number;
  proxyMode: 'none' | 'rotating';
  proxies?: string[];
  sources?: string[];
  niches?: string[];
  roles?: string[];
  deepFileSearch?: boolean;
  autoRevealer?: boolean;
}

export class ExtractionEngine extends EventEmitter {
  private activeBrowsers: Browser[] = [];
  private running = false;
  private paused = false;
  private shouldStop = false;
  private currentProxyIndex = 0;

  async start(config: CrawlConfig) {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.shouldStop = false;
    this.activeBrowsers = [];

    this.emit('event', { type: 'started', message: 'Extraction engine started', timestamp: new Date().toISOString() });
    addLog('Extraction engine started', 'info');

    try {
      let chromiumPath: string;
      try {
        // @ts-ignore
        chromiumPath = require('chromium').path;
        if (chromiumPath.includes('app.asar') && !chromiumPath.includes('app.asar.unpacked')) {
          chromiumPath = chromiumPath.replace('app.asar', 'app.asar.unpacked');
        }
      } catch {
        chromiumPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      }

      const searchQueries: { engine: string; query: string }[] = [];
      const sources = config.sources?.length ? config.sources : ['google', 'bing', 'duckduckgo'];
      const location = config.location && config.location !== 'Global (No specific location)' ? config.location : '';
      const city = (config as any).city?.trim() || '';
      const locationSuffix = city && location ? ` in ${city}, ${location}` : location ? ` in ${location}` : '';

      for (const kw of config.keywords) {
        const activeRoles = config.roles || [];
        const activeNiches = config.niches || [];

        const targetKeywords: string[] = activeRoles.length > 0
          ? activeRoles.flatMap(role => {
              if (role === 'ceo') return [`CEO ${kw}`, `Founder ${kw}`, `Managing Director ${kw}`];
              if (role === 'hr_managers') return [`HR Manager ${kw}`, `Human Resources ${kw}`];
              if (role === 'developers') return [`Software Engineer ${kw}`, `Developer ${kw}`];
              if (role === 'sales_reps') return [`Sales Manager ${kw}`, `Account Manager ${kw}`];
              if (role === 'doctors') return [`Doctor ${kw}`, `Physician ${kw}`];
              if (role === 'lawyers') return [`Lawyer ${kw}`, `Attorney ${kw}`];
              if (role === 'marketing_execs') return [`Marketing Manager ${kw}`, `CMO ${kw}`];
              return [`${role} ${kw}`];
            })
          : [kw];

        for (const targetKw of targetKeywords) {
          const base = `${targetKw}${locationSuffix}`;
          const queries = [
            `"${base}" email`,
            `"${base}" contact email`,
            `"${base}" "@gmail.com"`,
            `"${base}" "@yahoo.com"`,
            `"${base}" "@outlook.com"`,
            `"${base}" "@hotmail.com"`,
          ];

          if (activeNiches.includes('schools')) queries.push(`site:.edu "${base}" email`);
          if (activeNiches.includes('hospitals')) queries.push(`"hospital" "${base}" email`);
          if (activeNiches.includes('government')) queries.push(`site:.gov "${base}" email`);
          if (activeNiches.includes('software') || activeNiches.includes('it_services')) queries.push(`site:github.com "${base}" "@gmail.com"`);
          if (activeNiches.includes('real_estate')) queries.push(`"real estate" "${base}" email`);
          if (activeNiches.includes('law_firms')) queries.push(`"law firm" "${base}" email`);

          if (config.deepFileSearch) {
            if (sources.includes('pdf')) queries.push(`filetype:pdf "${base}" email`);
            if (sources.includes('excel')) queries.push(`filetype:xlsx "${base}" email`);
            if (sources.includes('word')) {
              queries.push(`filetype:docx "${base}" email`);
              queries.push(`filetype:doc "${base}" email`);
              queries.push(`filetype:rtf "${base}" email`);
            }
            if (sources.includes('txt')) queries.push(`filetype:txt "${base}" email`);
            if (sources.includes('csv') || sources.includes('excel')) queries.push(`filetype:csv "${base}" email`);
          }

          if (sources.includes('linkedin')) queries.push(`site:linkedin.com "${base}" email`);
          if (sources.includes('facebook')) queries.push(`site:facebook.com "${base}" email`);
          if (sources.includes('twitter')) queries.push(`site:twitter.com "${base}" email`);
          if (sources.includes('github')) queries.push(`site:github.com "${base}" "@gmail.com"`);
          if (sources.includes('craigslist')) queries.push(`site:craigslist.org "${base}" email`);

          for (const q of queries) {
            if (sources.includes('google') || sources.includes('google_global')) searchQueries.push({ engine: 'google', query: q });
            if (sources.includes('bing') || sources.includes('bing_global')) searchQueries.push({ engine: 'bing', query: q });
            if (sources.includes('duckduckgo')) searchQueries.push({ engine: 'duckduckgo', query: q });
            if (sources.includes('yahoo')) searchQueries.push({ engine: 'yahoo', query: q });
          }

          const enc = encodeURIComponent(base);
          if (sources.includes('yellowpages') || sources.includes('yellowpages_us')) searchQueries.push({ engine: 'direct', query: `https://www.yellowpages.com/search?search_terms=${enc}` });
          if (sources.includes('yelp_us') || sources.includes('yelp')) searchQueries.push({ engine: 'direct', query: `https://www.yelp.com/search?find_desc=${enc}` });
          if (sources.includes('manta')) searchQueries.push({ engine: 'direct', query: `https://www.manta.com/search?search_source=nav&search=1&q=${enc}` });
          if (sources.includes('justdial')) searchQueries.push({ engine: 'direct', query: `https://www.justdial.com/Search/${enc}` });
          if (sources.includes('yellowpages_ng')) searchQueries.push({ engine: 'direct', query: `https://www.yellowpages.com.ng/search?q=${enc}` });
          if (sources.includes('yellowpages_uk')) searchQueries.push({ engine: 'direct', query: `https://www.yellowpages.co.uk/search?q=${enc}` });
          if (sources.includes('yellowpages_au')) searchQueries.push({ engine: 'direct', query: `https://www.yellowpages.com.au/search/listings?clue=${enc}` });
          if (sources.includes('yellowpages_ca')) searchQueries.push({ engine: 'direct', query: `https://www.yellowpages.ca/search/si/1/${enc}` });
          if (sources.includes('indiamart')) searchQueries.push({ engine: 'direct', query: `https://m.indiamart.com/search.php?s=${enc}` });
        }
      }

      const getNextProxy = () => {
        if (!config.proxies || config.proxies.length === 0) return null;
        const proxy = config.proxies[this.currentProxyIndex];
        this.currentProxyIndex = (this.currentProxyIndex + 1) % config.proxies.length;
        return proxy;
      };

      const queue = [...searchQueries];
      const maxWorkers = Math.min(config.threads, 5);

      const workers = Array.from({ length: maxWorkers }, async (_, workerId) => {
        let browser: Browser | null = null;
        let currentProxy: string | null = null;

        const launchWorkerBrowser = async () => {
          if (browser) {
            try { 
              this.activeBrowsers = this.activeBrowsers.filter(b => b !== browser);
              await browser.close(); 
            } catch {}
          }
          currentProxy = config.proxyMode === 'rotating' ? getNextProxy() : null;
          
          const args = [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process'
          ];
          
          if (currentProxy) {
            const proxyHost = currentProxy.replace(/^https?:\/\//, '').split('@').pop();
            args.push(`--proxy-server=${proxyHost}`);
            addLog(`Worker ${workerId + 1} using proxy: ${proxyHost}`, 'info');
          }

          browser = await puppeteer.launch({
            headless: true,
            executablePath: chromiumPath,
            args
          });
          this.activeBrowsers.push(browser);
        };

        await launchWorkerBrowser();

        while (queue.length > 0 && !this.shouldStop) {
          while (this.paused && !this.shouldStop) await new Promise(r => setTimeout(r, 1000));
          if (this.shouldStop) break;

          const item = queue.shift();
          if (!item) break;

          const googleDomain = location === 'United Kingdom' ? 'google.co.uk'
            : location === 'Nigeria' ? 'google.com.ng'
            : location === 'India' ? 'google.co.in'
            : location === 'Germany' ? 'google.de'
            : location === 'France' ? 'google.fr'
            : location === 'Canada' ? 'google.ca'
            : location === 'Australia' ? 'google.com.au'
            : location === 'South Africa' ? 'google.co.za'
            : 'google.com';

          let url = '';
          if (item.engine === 'direct') url = item.query;
          else if (item.engine === 'google') url = `https://www.${googleDomain}/search?q=${encodeURIComponent(item.query)}`;
          else if (item.engine === 'bing') url = `https://www.bing.com/search?q=${encodeURIComponent(item.query)}`;
          else if (item.engine === 'duckduckgo') url = `https://duckduckgo.com/html/?q=${encodeURIComponent(item.query)}`;
          else if (item.engine === 'yahoo') url = `https://search.yahoo.com/search?p=${encodeURIComponent(item.query)}`;

          if (browser && url) {
            try {
              const success = await this.crawlWorkerPage(url, config.timeout, config.depth, 0, browser, currentProxy);
              if (!success && config.proxyMode === 'rotating') {
                addLog(`Worker ${workerId + 1} blocked or failed. Rotating proxy...`, 'warning');
                // Remove dead proxy from pool and DB
                if (currentProxy) {
                  config.proxies = (config.proxies || []).filter(p => p !== currentProxy);
                  updateProxyStatus(currentProxy, false, 0);
                  deleteFailedProxies();
                }
                await launchWorkerBrowser();
              }
            } catch (err: any) {
              addLog(`Worker ${workerId + 1} exception: ${err.message}. Restarting browser...`, 'error');
              // Remove proxy on auth/tunnel/connection errors
              if (currentProxy && (
                err.message?.includes('ERR_INVALID_AUTH_CREDENTIALS') ||
                err.message?.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
                err.message?.includes('ERR_CONNECTION_RESET') ||
                err.message?.includes('ERR_TIMED_OUT') ||
                err.message?.includes('ERR_PROXY')
              )) {
                config.proxies = (config.proxies || []).filter(p => p !== currentProxy);
                updateProxyStatus(currentProxy, false, 0);
                deleteFailedProxies();
                addLog(`Proxy ${currentProxy} removed from pool (connection error)`, 'warning');
              }
              await launchWorkerBrowser();
            }
          }
          await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
        }

        if (browser) {
          try { await (browser as Browser).close(); } catch {}
          this.activeBrowsers = this.activeBrowsers.filter(b => b !== browser);
        }
      });

      await Promise.all(workers);
    } catch (err: any) {
      this.emit('event', { type: 'error', message: `Engine fatal error: ${err.message}`, timestamp: new Date().toISOString() });
      addLog(`Engine fatal error: ${err.message}`, 'error');
    } finally {
      await this.cleanup();
      this.running = false;
      this.emit('event', { type: 'complete', message: 'Extraction complete', timestamp: new Date().toISOString() });
      addLog('Extraction complete', 'success');
    }
  }

  private async crawlWorkerPage(url: string, timeout: number, maxDepth: number, depth: number = 0, browser: Browser, proxy: string | null): Promise<boolean> {
    if (this.shouldStop) return true;

    const lowerUrl = url.toLowerCase();
    if (DOC_EXTENSIONS.some(ext => lowerUrl.endsWith(ext))) {
      await this.extractFromFile(url);
      return true;
    }

    let page: Page | null = null;
    try {
      this.emit('event', { type: 'crawling', message: `Crawling: ${url}`, timestamp: new Date().toISOString() });

      page = await browser.newPage();
      
      if (proxy && proxy.includes('@')) {
        const authPart = proxy.split('@')[0].replace(/^https?:\/\//, '');
        const [username, password] = authPart.split(':');
        if (username && password) await page.authenticate({ username, password });
      }

      const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      await page.setUserAgent(ua);
      
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
          req.abort();
        } else if (type === 'document' && DOC_EXTENSIONS.some(ext => req.url().toLowerCase().endsWith(ext))) {
          req.abort();
        } else {
          req.continue();
        }
      });

      const isSearchPage = /google|bing|duckduckgo|yahoo|yellowpages|yelp|manta/.test(url);
      
      try {
        await page.goto(url, { 
          waitUntil: isSearchPage ? 'domcontentloaded' : 'networkidle2', 
          timeout: timeout * 1000 
        });
      } catch (err: any) {
        if (err.message.includes('timeout')) return false;
        throw err;
      }

      const content = await page.content();
      const bodyText = await page.evaluate(() => document.body?.innerText || '');

      const blockPatterns = ['CAPTCHA', 'To continue, please type the characters', 'Access Denied', 'robot check', 'security check', 'suspicious activity', '429 Too Many Requests'];
      if (blockPatterns.some(p => content.includes(p) || bodyText.includes(p))) {
        this.emit('event', { type: 'error', message: `Block detected on ${new URL(url).hostname}`, timestamp: new Date().toISOString() });
        return false;
      }

      if (isSearchPage && depth < maxDepth) {
        const links = await page.evaluate(() => {
          const links: string[] = [];
          document.querySelectorAll('a').forEach(a => {
            const href = (a as HTMLAnchorElement).href;
            if (href && href.startsWith('http')) {
              const isInternal = /google\.com|bing\.com|duckduckgo\.com|yahoo\.com|microsoft\.com|youtube\.com|facebook\.com\/sharer|twitter\.com\/intent/.test(href);
              if (!isInternal) links.push(href);
            }
          });
          return links;
        });
        const uniqueLinks = [...new Set(links)].slice(0, 30);
        for (const link of uniqueLinks) {
          if (this.shouldStop) break;
          await this.crawlWorkerPage(link, timeout, Math.min(maxDepth, 2), depth + 1, browser, proxy);
        }
      }

      await this.processText(content + ' ' + bodyText, url);
      this.emit('event', { type: 'page-scanned', message: `Scanned: ${url}`, timestamp: new Date().toISOString() });
      return true;
    } catch (err: any) {
      this.emit('event', { type: 'error', message: `Error crawling ${url}: ${err.message}`, timestamp: new Date().toISOString() });
      return false;
    } finally {
      if (page) { try { await page.close(); } catch { } }
    }
  }

  private async extractFromFile(url: string) {
    try {
      const lowerUrl = url.toLowerCase();
      this.emit('event', { type: 'crawling', message: `Extracting from document: ${url}`, timestamp: new Date().toISOString() });
      
      const response = await axios.get(url, { 
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': USER_AGENTS[0] }
      });
      const buffer = Buffer.from(response.data);
      let text = '';

      if (lowerUrl.endsWith('.pdf')) {
        // @ts-ignore
        const data = await pdf(buffer);
        text = data.text;
      } else if (lowerUrl.endsWith('.xlsx') || lowerUrl.endsWith('.xls')) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        workbook.eachSheet(sheet => {
          sheet.eachRow(row => {
            if (row && row.values && Array.isArray(row.values)) {
              text += row.values.filter(v => v != null).map(String).join(' ') + ' ';
            }
          });
        });
      } else if (lowerUrl.endsWith('.csv')) {
        text = await new Promise((resolve) => {
          let content = '';
          const stream = fastCsv.parse({ headers: false })
            .on('data', row => { content += Object.values(row).join(' ') + ' '; })
            .on('end', () => resolve(content))
            .on('error', () => resolve(''));
          stream.write(buffer);
          stream.end();
        });
      } else if (lowerUrl.endsWith('.docx')) {
        try {
          const directory = await unzipper.Open.buffer(buffer);
          const documentFile = directory.files.find((f: { path: string }) => f.path === 'word/document.xml');
          if (documentFile) {
            const xml = await documentFile.buffer();
            text = xml.toString().replace(/<[^>]+>/g, ' ');
          }
        } catch (e: unknown) {
          addLog(`DOCX extraction failed: ${(e as Error).message}`, 'warning');
        }
      } else if (lowerUrl.endsWith('.txt') || lowerUrl.endsWith('.rtf')) {
        text = buffer.toString('utf8');
        if (text.includes('\u0000')) text = buffer.toString('utf16le');
      } else if (lowerUrl.endsWith('.doc') || lowerUrl.endsWith('.xls')) {
        // Fallback for old binary formats: try to extract printable strings
        text = buffer.toString('binary').replace(/[^\x20-\x7E\s]/g, ' ');
      }

      if (text.trim()) {
        await this.processText(text, url);
        addLog(`Extracted data from: ${url}`, 'success');
      }
    } catch (err: any) {
      addLog(`Failed to process document ${url}: ${err.message}`, 'error');
    }
  }

  private async processText(text: string, sourceUrl: string) {
    const emails = text.match(EMAIL_REGEX) || [];
    const uniqueEmails = [...new Set(emails)];
    const domain = new URL(sourceUrl).hostname;

    addDomain(domain);
    incrementDomainPages(domain);
    
    const phones = text.match(PHONE_REGEX) || [];
    const uniquePhones = [...new Set(phones)].map(p => p.trim()).filter(p => p.length > 8);
    const primaryPhone = uniquePhones[0] || '';

    for (const email of uniqueEmails) {
      const emailLower = email.toLowerCase();
      let foundName = '';
      const emailIndex = text.indexOf(email);
      if (emailIndex !== -1) {
        const contextBefore = text.substring(Math.max(0, emailIndex - 100), emailIndex);
        const nameMatch = contextBefore.match(/(?:Name|Contact|Owner|Attention):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i) 
                        || contextBefore.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s*[<(\]|,]|$)/);
        if (nameMatch) foundName = nameMatch[1].trim();
      }

      if (email.includes('%') || email.includes(' ') || email.includes('+')) continue;
      
      const [user, mailDomain] = emailLower.split('@');
      if (ASSET_EXTENSIONS.some(ext => emailLower.endsWith(ext))) continue;
      if (BLACKLIST.some((b) => mailDomain.includes(b))) continue;
      if (BUSINESS_ROLES.some(role => user === role)) continue;
      if (GOV_EXTENSIONS.some(ext => mailDomain.endsWith(ext))) continue;

      const domainName = mailDomain.split('.')[0];
      const isPersonalProvider = UNIVERSAL_PERSONAL_PROVIDERS.includes(mailDomain);
      if (user === domainName && !isPersonalProvider) continue;

      if (email.length > 80) continue;

      // Score email for marketing quality (AI-powered free validation)
      const marketingValidation = scoreEmailForMarketing(emailLower, mailDomain);
      
      const added = addEmail(email, mailDomain, sourceUrl, primaryPhone, foundName, marketingValidation.score, marketingValidation.isMarketingReady, marketingValidation.riskLevel);
      if (added) {
        this.emit('event', {
          type: 'email-found',
          message: `Found: ${email}${marketingValidation.isMarketingReady ? ' ✓ (Marketing Ready)' : ' ⚠ (Risky for Marketing)'}`,
          data: { id: Date.now(), email, domain: mailDomain, sourcePage: sourceUrl, phone: primaryPhone, name: foundName, status: 'pending', foundAt: new Date().toISOString(), marketingScore: marketingValidation.score, isMarketingReady: marketingValidation.isMarketingReady, marketingRisk: marketingValidation.riskLevel },
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  pause() { this.paused = !this.paused; this.emit('event', { type: this.paused ? 'paused' : 'started', message: this.paused ? 'Engine paused' : 'Engine resumed', timestamp: new Date().toISOString() }); addLog(this.paused ? 'Engine paused' : 'Engine resumed', 'info'); }
  stop() { this.shouldStop = true; this.emit('event', { type: 'stopped', message: 'Engine stopping...', timestamp: new Date().toISOString() }); addLog('Engine stopped by user', 'warning'); }
  isRunning() { return this.running; }

  private async cleanup() {
    for (const b of this.activeBrowsers) {
      try { await b.close(); } catch { }
    }
    this.activeBrowsers = [];
  }
}
