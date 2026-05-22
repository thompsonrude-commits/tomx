export const BLACKLIST = [
  'example.com', 'sentry.io', 'wixpress.com', 'w3.org', 'schema.org', 'googleapis.com',
  'facebook.com', 'twitter.com', 'google.com', 'wordpress.org', 'gravatar.com', 'jquery.com',
  'duckduckgo.com', 'bing.com', 'microsoft.com', 'youtube.com', 'messenger.com',
  'instagram.com', 'linkedin.com', 'googlegroups.com', 'yahoogroups.com', 'groups.io',
  'github.com', 'bitbucket.org', 'gitlab.com', 'stackoverflow.com', 'reddit.com',
  'example.net', 'example.org', 'yourcompany.com', 'yourdomain.com', 'mysite.com',
  'test.com', 'testing.com', 'demo.com', 'localhost.com', 'domain.com', 'website.com',
  'placeholder.com', 'template.com'
];

export const DISPOSABLE_PROVIDERS = [
  'mailinator.com', 'yopmail.com', 'temp-mail.org', 'guerrillamail.com', '10minutemail.com',
  'sharklasers.com', 'dispostable.com', 'getairmail.com', 'maildrop.cc', 'trashmail.com',
  'tmail.io', 'mytemp.email', 'tempmail.net', 'fakeinbox.com', 'throwawaymail.com',
  'mailnesia.com', 'mailcatch.com', 'discard.email', 'mailnull.com', 'notsharingmy.info'
];

export const UNIVERSAL_PERSONAL_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com',
  'msn.com', 'live.com', 'ymail.com', 'rocketmail.com', 'mail.com', 'gmx.com',
  'zoho.com', 'yandex.com', 'yandex.ru', 'rambler.ru', 'mail.ru', 'protonmail.com',
  'me.com', 'qq.com', '163.com', 'sina.com', 'rediffmail.com', 'fastmail.com'
];

export function isQualityLead(email: string): { isQuality: boolean; reason?: string } {
  const emailLower = email.toLowerCase().trim();

  // Must have exactly one @
  const parts = emailLower.split('@');
  if (parts.length !== 2) return { isQuality: false, reason: 'Malformed email (missing @)' };
  const [user, domain] = parts;

  // Basic format checks
  if (!user || user.length < 1) return { isQuality: false, reason: 'Username too short' };
  if (!domain || !domain.includes('.')) return { isQuality: false, reason: 'Invalid domain' };
  if (emailLower.includes(' ') || emailLower.includes('..')) {
    return { isQuality: false, reason: 'Invalid characters in email' };
  }

  // Blacklisted system domains
  if (BLACKLIST.some(b => domain === b || domain.endsWith('.' + b))) {
    return { isQuality: false, reason: 'System/placeholder domain' };
  }

  // Disposable providers
  if (DISPOSABLE_PROVIDERS.some(d => domain === d)) {
    return { isQuality: false, reason: 'Disposable email provider' };
  }

  // Documentation patterns
  if (/examp[1li]e/i.test(emailLower) || /your-domain/i.test(emailLower)) {
    return { isQuality: false, reason: 'Documentation example address' };
  }

  // All other emails pass — let the SMTP server decide
  return { isQuality: true };
}

export const SPAM_TRIGGER_WORDS = [
  'free', 'win', 'winner', 'cash', 'money', 'urgent', 'act now', 'guarantee',
  '100%', 'no cost', 'no obligation', 'offer', 'congratulations', 'claims',
  'refinance', 'insurance', 'debt', 'investment', 'rich', 'wealth',
  'bitcoin', 'crypto', 'lottery', 'inheritance', 'bank account', 'beneficiary',
  'exclusive', 'limited time', 'lowest price', 'apply now', 'instant',
  'viagra', 'cialis', 'pharmacy', 'luxury', 'watches', 'replica'
];

export function calculateSpamScore(subject: string, body: string): { score: number; triggers: string[] } {
  const fullText = (subject + ' ' + body).toLowerCase();
  const triggers: string[] = [];
  let score = 0;

  for (const word of SPAM_TRIGGER_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = fullText.match(regex);
    if (matches) {
      score += matches.length * 10;
      triggers.push(word);
    }
  }

  const capsCount = (fullText.match(/[A-Z]/g) || []).length;
  if (capsCount > fullText.length * 0.3 && fullText.length > 20) {
    score += 25;
    triggers.push('Excessive Capitalization');
  }

  if (/!!!/.test(fullText)) {
    score += 15;
    triggers.push('Multiple Exclamation Marks');
  }

  return { score, triggers };
}
