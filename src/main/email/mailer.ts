import { EventEmitter } from 'events';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { addMailingLog, getSmtps, getWorkingProxies } from '../db/database';
import { verifyEmail } from './verifier';
import { calculateSpamScore } from '../utils/emailFilters';

interface MailerConfig {
  subject: string;
  body: string;
  recipients: string[];
  autoRephrase?: boolean;
  attachments?: { filename: string; path: string }[];
}

interface CampaignRecord {
  recipient: string;
  status: 'Sent' | 'Failed' | 'Skipped';
  location: string;
  reason: string;
  smtp: string;
  time: string;
}

export class EmailMailer extends EventEmitter {
  private running = false;
  private shouldStop = false;
  private campaignRecords: CampaignRecord[] = [];

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  async start(config: MailerConfig) {
    if (this.running) return;
    this.running = true;
    this.shouldStop = false;
    this.campaignRecords = [];

    const smtps = getSmtps();
    if (smtps.length === 0) {
      this.emit('event', { type: 'error', message: 'No SMTP accounts configured' });
      this.running = false;
      return;
    }

    const smtpQueues: string[][] = smtps.map(() => []);
    config.recipients.forEach((r, i) => smtpQueues[i % smtps.length].push(r));

    const workingProxies = getWorkingProxies();
    const getProxy = (idx: number): string | null =>
      workingProxies.length > 0 ? workingProxies[idx % workingProxies.length] : null;

    this.emit('event', {
      type: 'started',
      message: `Campaign started: ${config.recipients.length} recipients across ${smtps.length} SMTP account(s)${workingProxies.length > 0 ? ` via ${workingProxies.length} proxies` : ' (direct connection)'}`
    });

    const workers = smtps.map((smtp, smtpIdx) =>
      this.runSmtpWorker(smtp, smtpQueues[smtpIdx], config, getProxy(smtpIdx))
    );

    await Promise.all(workers);

    this.running = false;

    // Generate campaign report
    const reportPath = this.generateCampaignReport(config.subject);

    const sent = this.campaignRecords.filter(r => r.status === 'Sent').length;
    const failed = this.campaignRecords.filter(r => r.status === 'Failed').length;
    const skipped = this.campaignRecords.filter(r => r.status === 'Skipped').length;

    this.emit('event', {
      type: 'complete',
      message: `Campaign complete — Sent: ${sent} | Failed: ${failed} | Skipped: ${skipped}`,
      report: { sent, failed, skipped, total: this.campaignRecords.length, reportPath }
    });
  }

  private async runSmtpWorker(smtp: any, recipients: string[], config: MailerConfig, proxy: string | null = null) {
    for (let i = 0; i < recipients.length; i++) {
      if (this.shouldStop) break;

      const recipient = recipients[i];
      const time = new Date().toLocaleTimeString();

      try {
        // Pre-flight verification
        const vResult = await verifyEmail(recipient);

        if (!vResult.valid) {
          const reason = vResult.status || 'Invalid email';
          this.emit('event', {
            type: 'error',
            message: `[${smtp.user}] Skipped ${recipient}: ${reason}`,
            recipient
          });
          addMailingLog({
            smtpId: smtp.id,
            recipient,
            subject: config.subject,
            status: 'skipped',
            deliveryLocation: 'Invalid Recipient',
            statusDetails: reason
          });
          this.campaignRecords.push({ recipient, status: 'Skipped', location: 'Invalid Recipient', reason, smtp: smtp.user, time });
          if (i < recipients.length - 1 && !this.shouldStop) {
            await new Promise(r => setTimeout(r, 60000));
          }
          continue;
        }

        let personalizedSubject = this.replacePlaceholders(config.subject, recipient);
        let personalizedBody = this.replacePlaceholders(config.body, recipient);
        personalizedSubject = this.parseSpintax(personalizedSubject);
        personalizedBody = this.parseSpintax(personalizedBody);

        if (config.autoRephrase) {
          personalizedSubject = this.autoRephrase(personalizedSubject);
          personalizedBody = this.autoRephrase(personalizedBody);
        }

        const spamRisk = calculateSpamScore(personalizedSubject, personalizedBody);
        const info = await this.sendEmail(smtp, recipient, personalizedSubject, personalizedBody, config.attachments, proxy);
        const smtpResponse = info.response || '';

        let deliveryLocation = 'Inbox';
        let statusDetails = 'Standard Handover Success';

        if (spamRisk.score > 50) {
          deliveryLocation = 'Likely Spam';
          statusDetails = `High Spam Score (${spamRisk.score}): ${spamRisk.triggers.join(', ')}`;
        }
        if (smtpResponse.toLowerCase().includes('spam') || smtpResponse.toLowerCase().includes('policy')) {
          deliveryLocation = 'Spam/Blocked';
          statusDetails = `Server Flagged: ${smtpResponse}`;
        }

        this.emit('event', {
          type: 'sent',
          message: `[${smtp.user}] Sent to ${recipient} [${deliveryLocation}]`,
          recipient,
          smtpUser: smtp.user,
          deliveryLocation
        });

        addMailingLog({
          smtpId: smtp.id,
          recipient,
          subject: personalizedSubject,
          status: 'success',
          deliveryLocation,
          statusDetails
        });

        this.campaignRecords.push({ recipient, status: 'Sent', location: deliveryLocation, reason: statusDetails, smtp: smtp.user, time });

      } catch (err: any) {
        const errorMessage = err.message || 'Unknown error';
        this.emit('event', {
          type: 'error',
          message: `[${smtp.user}] Failed ${recipient}: ${errorMessage}`,
          recipient
        });
        addMailingLog({
          smtpId: smtp.id,
          recipient,
          subject: config.subject,
          status: 'error',
          deliveryLocation: 'Blocked',
          error: errorMessage
        });

        this.campaignRecords.push({ recipient, status: 'Failed', location: 'Blocked', reason: errorMessage, smtp: smtp.user, time });

        // Send failure notification to sender's own email
        this.sendFailureNotification(smtp, recipient, errorMessage, time).catch(() => {});

        // Stop this worker if rate limited
        if (errorMessage.includes('550-5.4.5') ||
            errorMessage.includes('550 5.4.5') ||
            errorMessage.toLowerCase().includes('sending limit exceeded') ||
            errorMessage.toLowerCase().includes('quota exceeded') ||
            errorMessage.toLowerCase().includes('daily user sending limit')) {
          this.emit('event', { type: 'error', message: `[${smtp.user}] Sending limit reached. Worker stopped.` });
          break;
        }
      }

      if (i < recipients.length - 1 && !this.shouldStop) {
        this.emit('event', { type: 'waiting', message: `[${smtp.user}] Waiting 60s before next send...` });
        await new Promise(r => setTimeout(r, 60000));
      }
    }
  }

  private generateCampaignReport(subject: string): string {
    try {
      const dir = 'C:\\ProgramData\\TomXtractor\\Reports';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(dir, `campaign_report_${timestamp}.csv`);

      const sentRecords    = this.campaignRecords.filter(r => r.status === 'Sent');
      const failedRecords  = this.campaignRecords.filter(r => r.status === 'Failed');
      const skippedRecords = this.campaignRecords.filter(r => r.status === 'Skipped');
      const total          = this.campaignRecords.length;

      // Find the max rows needed across all columns
      const maxRows = Math.max(sentRecords.length, failedRecords.length, skippedRecords.length, 1);

      const lines: string[] = [];

      // Row 1: Title
      lines.push(`CAMPAIGN REPORT`);

      // Row 2: Column headers
      lines.push(`Date,Subject,Total,Sent,Blocked,Skipped`);

      // Row 3: First data row with campaign info + first email in each category
      lines.push(
        `"${new Date().toLocaleString()}",` +
        `"${subject}",` +
        `${total},` +
        `"${sentRecords[0]?.recipient || 'None'}",` +
        `"${failedRecords[0]?.recipient || 'None'}",` +
        `"${skippedRecords[0]?.recipient || 'None'}"`
      );

      // Remaining rows — just emails under each column
      for (let i = 1; i < maxRows; i++) {
        lines.push(
          `,,,"${sentRecords[i]?.recipient || ''}","${failedRecords[i]?.recipient || ''}","${skippedRecords[i]?.recipient || ''}"`
        );
      }

      fs.writeFileSync(filePath, lines.join('\r\n'), 'utf-8');
      return filePath;
    } catch {
      return '';
    }
  }

  stop() {
    this.shouldStop = true;
    this.emit('event', { type: 'stopped', message: 'Campaign stopped by user' });
  }

  private replacePlaceholders(text: string, recipient: string): string {
    const domain = recipient.split('@')[1] || '';
    const date = new Date().toLocaleDateString();
    return text
      .replace(/{email}/g, recipient)
      .replace(/{domain}/g, domain)
      .replace(/{date}/g, date);
  }

  private parseSpintax(text: string): string {
    const spintaxRegex = /{([^{}]+)}/g;
    let match;
    let result = text;
    while ((match = spintaxRegex.exec(result)) !== null) {
      const options = match[1].split('|');
      const selected = options[Math.floor(Math.random() * options.length)];
      result = result.replace(match[0], selected);
      spintaxRegex.lastIndex = 0;
    }
    return result;
  }

  private autoRephrase(text: string): string {
    const synonymGroups = [
      ['Hello', 'Hi', 'Greetings', 'Dear', 'Hey'],
      ['interested in', 'looking for', 'inquiring about', 'following up on'],
      ['best', 'warm', 'kind', 'sincere'],
      ['regards', 'wishes', 'thanks', 'respects'],
      ['found', 'noticed', 'saw', 'discovered', 'came across'],
      ['website', 'site', 'page', 'online profile'],
      ['Thanks', 'Thank you', 'Many thanks'],
      ['services', 'offerings', 'solutions', 'expertise'],
      ['business', 'company', 'firm', 'organization'],
    ];

    let rephrased = text;
    for (const group of synonymGroups) {
      const escapedWords = group.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const regex = new RegExp(`\\b(${escapedWords})\\b`, 'gi');
      rephrased = rephrased.replace(regex, (match) => {
        const others = group.filter(w => w.toLowerCase() !== match.toLowerCase());
        if (others.length === 0) return match;
        const selected = others[Math.floor(Math.random() * others.length)];
        return match[0] === match[0].toUpperCase()
          ? selected.charAt(0).toUpperCase() + selected.slice(1)
          : selected.toLowerCase();
      });
    }
    return rephrased;
  }

  private async sendFailureNotification(smtp: any, failedRecipient: string, reason: string, time: string) {
    const actualFromEmail = smtp.fromEmail || smtp.user;

    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure === 1,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false, minVersion: 'TLSv1' },
      connectionTimeout: 15000,
    });

    await transport.sendMail({
      from: `"Delivery Notification" <${actualFromEmail}>`,
      to: actualFromEmail,
      subject: `Delivery Failed: ${failedRecipient}`,
      text: `Your email to ${failedRecipient} could not be delivered.\n\nReason: ${reason}\n\nTime: ${time}`,
      html: `<div style="font-family:Arial,sans-serif;padding:20px;background:#f9f9f9;border-left:4px solid #e53e3e;">
        <h3 style="color:#e53e3e;margin:0 0 10px">Delivery Failure Notification</h3>
        <p><strong>Recipient:</strong> ${failedRecipient}</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p><strong>Time:</strong> ${time}</p>
        <p style="color:#666;font-size:12px;margin-top:20px">This is an automated notification from TomXtractor 49ja Mailer.</p>
      </div>`
    });
  }

  private async sendEmail(smtp: any, to: string, subject: string, body: string, attachments?: { filename: string; path: string }[], proxy?: string | null) {
    const isGmail = smtp.host.toLowerCase().includes('gmail.com') || smtp.user.toLowerCase().endsWith('@gmail.com');
    const isYahoo = smtp.host.toLowerCase().includes('yahoo.com') || smtp.user.toLowerCase().endsWith('@yahoo.com');

    const transportConfig: any = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure === 1,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false, minVersion: 'TLSv1' },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 45000,
    };

    if (isGmail) transportConfig.service = 'gmail';
    else if (isYahoo) transportConfig.service = 'yahoo';

    const transporter = nodemailer.createTransport(transportConfig);

    const actualFromEmail = smtp.fromEmail || smtp.user;
    const actualFromName = smtp.fromName || 'Mailer';
    const fromAddress = `"${actualFromName}" <${actualFromEmail}>`;
    const replyAddress = smtp.replyTo || actualFromEmail;

    const bodyLow = body.toLowerCase();
    const isFullHtml = bodyLow.includes('<html') || bodyLow.includes('<body') || bodyLow.includes('<head');
    const htmlContent = isFullHtml ? body : (body.includes('<')
      ? `<div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;">${body}</div>`
      : body.replace(/\n/g, '<br>'));

    const textContent = body
      .replace(/<style[^>]*>.*<\/style>/gms, '')
      .replace(/<[^>]*>?/gm, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    return await transporter.sendMail({
      from: fromAddress,
      to,
      replyTo: replyAddress,
      subject,
      text: textContent,
      html: htmlContent,
      headers: {
        'List-Unsubscribe': `<mailto:${actualFromEmail}?subject=unsubscribe>`,
        'Precedence': 'bulk'
      },
      attachments: attachments?.map(att => ({ filename: att.filename, path: att.path }))
    });
  }

  async testSmtp(smtp: any) {
    const isGmail = smtp.host.toLowerCase().includes('gmail.com') || smtp.user.toLowerCase().endsWith('@gmail.com');
    const isYahoo = smtp.host.toLowerCase().includes('yahoo.com') || smtp.user.toLowerCase().endsWith('@yahoo.com');

    const transportConfig: any = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure === 1,
      auth: { user: smtp.user, pass: smtp.pass },
      tls: { rejectUnauthorized: false, minVersion: 'TLSv1' },
      connectionTimeout: 30000,
    };

    if (isGmail) transportConfig.service = 'gmail';
    else if (isYahoo) transportConfig.service = 'yahoo';

    const transporter = nodemailer.createTransport(transportConfig);
    try {
      await transporter.verify();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  isRunning() { return this.running; }
}

export const emailMailer = new EmailMailer();
