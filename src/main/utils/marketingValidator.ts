/**
 * Marketing Email Validator
 * Free, local AI-powered scoring for genuine marketing-ready emails
 * No external APIs - uses heuristic patterns and public data
 */

// Known honeypot/trap email patterns (FREE DATA SOURCE)
const HONEYPOT_PATTERNS = [
  /^(test|fake|spam|trap|honeypot|bot|noreply|no-reply|do-not-reply)@/i,
  /^abuse@/i,
  /^compliance@/i,
  /^legal@/i,
  /^security@/i,
  /postmaster@/i,
  /webmaster@/i,
];

// Generic role-based emails (lower marketing value)
const GENERIC_ROLE_EMAILS = [
  'info@', 'hello@', 'contact@', 'support@', 'help@', 'admin@', 'office@',
  'team@', 'sales@', 'marketing@', 'press@', 'media@', 'inquiry@',
  'hello@', 'hi@', 'hey@', 'mail@', 'mail-', 'feedback@', 'queries@',
  'inquiries@', 'booking@', 'reservations@', 'enquiry@', 'order@',
  'customer@', 'clients@', 'billing@', 'accounts@', 'jobs@', 'hr@'
];

// Known marketing-trap domains (free lists)
const MARKETING_TRAP_DOMAINS = [
  'spam-trap.net', 'honeypot.com', 'spamtrap.io',
  'nonexistent.org', 'invalid.net',
  'nowhere.net', 'sink.net'
];

// Signs of legitimate business domains
const BUSINESS_DOMAIN_INDICATORS = [
  '.com', '.co.uk', '.com.au', '.de', '.fr', '.it', '.es', '.nl',
  '.ca', '.ca', '.mx', '.br', '.jp', '.cn', '.in', '.ru', '.ng'
];

// Numbers-only or sequential patterns (high-risk emails)
const SUSPICIOUS_PATTERNS = [
  /^\d+@/,                          // starts with numbers only
  /^[0-9]{2,}@/,                    // multiple digits at start
  /^(a|test|user|admin|1|2|3|test)[0-9]{5,}@/i,  // generic + many numbers
  /[_.-]{2,}/,                       // multiple consecutive separators
  /^x{2,}@|^z{2,}@|^q{2,}@/i        // repeated letter patterns
];

// Business quality indicators
const BUSINESS_INDICATORS = [
  'founder', 'ceo', 'director', 'manager', 'lead', 'head',
  'specialist', 'engineer', 'architect', 'consultant', 'advisor',
  'executive', 'principal', 'senior', 'junior', 'associate',
  'owner', 'partner', 'president', 'vice', 'regional'
];

interface MarketingScore {
  score: number;                    // 0-100
  isMarketingReady: boolean;        // True if score >= 60
  riskLevel: 'safe' | 'medium' | 'high';
  reasons: string[];
  honeypotRisk: boolean;
  domainLegitimacy: number;         // 0-100
  emailQuality: number;             // 0-100
  businessIndicators: string[];
}

/**
 * Comprehensive marketing validation - detects genuine business emails
 * Uses free data sources and pattern analysis (no external APIs)
 */
export function scoreEmailForMarketing(email: string, domain: string): MarketingScore {
  const emailLower = email.toLowerCase().trim();
  const localPart = emailLower.split('@')[0];
  
  let score = 100; // Start perfect, deduct for risks
  const reasons: string[] = [];
  const businessIndicators: string[] = [];
  let honeypotRisk = false;
  let domainLegitimacy = 100;

  // ============ HONEYPOT DETECTION ============
  for (const pattern of HONEYPOT_PATTERNS) {
    if (pattern.test(emailLower)) {
      score -= 50;
      reasons.push('Matches honeypot pattern');
      honeypotRisk = true;
      break;
    }
  }

  // ============ GENERIC ROLE EMAIL DETECTION ============
  const isGenericRole = GENERIC_ROLE_EMAILS.some(role => emailLower.startsWith(role));
  if (isGenericRole) {
    score -= 20;
    reasons.push('Generic role-based email (lower conversion rate)');
  }

  // ============ SUSPICIOUS PATTERN DETECTION ============
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(localPart)) {
      score -= 25;
      reasons.push('Suspicious character pattern detected');
      honeypotRisk = true;
      break;
    }
  }

  // ============ DOMAIN LEGITIMACY ============
  if (MARKETING_TRAP_DOMAINS.includes(domain)) {
    score -= 50;
    reasons.push('Known marketing trap domain');
    domainLegitimacy = 10;
    honeypotRisk = true;
  }

  // Domain too short or suspicious
  if (domain.length < 4) {
    score -= 30;
    reasons.push('Domain too short (suspicious)');
    domainLegitimacy = 30;
  }

  // Check for business TLDs
  const hasBusinessTld = BUSINESS_DOMAIN_INDICATORS.some(tld => domain.endsWith(tld));
  if (!hasBusinessTld) {
    domainLegitimacy -= 20;
    if (!domain.includes('.')) {
      score -= 20;
      reasons.push('Invalid domain extension');
    }
  }

  // Subdomain (generally higher risk)
  const domainParts = domain.split('.');
  if (domainParts.length > 2) {
    if (!['mail', 'smtp', 'email', 'msg'].includes(domainParts[0])) {
      score -= 10;
      reasons.push('Unusual subdomain structure');
    }
  }

  // ============ EMAIL QUALITY ANALYSIS ============
  let emailQuality = 100;

  // Length check (too short = suspicious)
  if (localPart.length < 3) {
    score -= 15;
    emailQuality -= 30;
    reasons.push('Email username too short');
  }

  // Contains only numbers (HIGH RISK)
  if (/^\d+$/.test(localPart)) {
    score -= 30;
    emailQuality = 20;
    reasons.push('Email is numbers-only (major spam indicator)');
    honeypotRisk = true;
  }

  // Very long email (unusual)
  if (localPart.length > 50) {
    score -= 10;
    emailQuality -= 15;
    reasons.push('Unusually long email address');
  }

  // Multiple consecutive dots/dashes (suspicious)
  if (/\.{2,}|-{2,}|_{2,}/.test(localPart)) {
    score -= 15;
    emailQuality -= 25;
    reasons.push('Suspicious character sequences');
  }

  // ============ BUSINESS INDICATOR DETECTION ============
  for (const indicator of BUSINESS_INDICATORS) {
    if (localPart.includes(indicator)) {
      score += 15; // Bonus for legitimate business roles
      businessIndicators.push(indicator);
      break;
    }
  }

  // Name-like patterns (positive indicator)
  const namePattern = /^[a-z]+[._-]?[a-z]+$/i;
  if (namePattern.test(localPart) && localPart.length > 4 && businessIndicators.length === 0) {
    score += 10;
    reasons.push('Name-based pattern (likely person)');
  }

  // ============ DISPOSABLE/PERSONAL PROVIDER CHECK ============
  const personalProviders = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
    'mail.ru', 'yandex.ru', 'qq.com', '163.com', 'sina.com'
  ];
  
  if (personalProviders.includes(domain)) {
    score -= 25;
    reasons.push('Personal email provider (not business domain)');
  }

  // ============ FINAL SCORING ============
  score = Math.max(0, Math.min(100, score)); // Clamp 0-100
  domainLegitimacy = Math.max(0, Math.min(100, domainLegitimacy));
  emailQuality = Math.max(0, Math.min(100, emailQuality));

  // Determine risk level
  let riskLevel: 'safe' | 'medium' | 'high' = 'safe';
  if (honeypotRisk || score < 40) {
    riskLevel = 'high';
  } else if (score < 60) {
    riskLevel = 'medium';
  }

  // Final assessment message
  if (score >= 75 && !honeypotRisk) {
    reasons.unshift('✓ High quality - Safe to use in marketing');
  } else if (score >= 60 && score < 75) {
    reasons.unshift('⚠ Medium quality - Monitor for bounces');
  } else if (score >= 40 && score < 60) {
    reasons.unshift('⚠ Low quality - Higher bounce risk');
  } else {
    reasons.unshift('✗ Very low quality - Not recommended for marketing');
  }

  return {
    score: Math.round(score),
    isMarketingReady: score >= 60 && !honeypotRisk,
    riskLevel,
    reasons,
    honeypotRisk,
    domainLegitimacy: Math.round(domainLegitimacy),
    emailQuality: Math.round(emailQuality),
    businessIndicators
  };
}

/**
 * Quick check - just returns true/false for marketing readiness
 * Use for batch operations
 */
export function isMarketingReady(email: string, domain: string): boolean {
  const result = scoreEmailForMarketing(email, domain);
  return result.isMarketingReady;
}

/**
 * Get color/priority indicator for UI
 */
export function getMarketingRiskColor(score: number): string {
  if (score >= 75) return 'green';    // Safe
  if (score >= 60) return 'yellow';   // Medium
  if (score >= 40) return 'orange';   // Low
  return 'red';                       // Very Low
}
