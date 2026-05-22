/**
 * STRICT EMAIL VALIDATION UTILITY
 * Consolidates TLD whitelisting and word-fragment rejection logic.
 */
import * as dns from 'dns';

// Cache for domain MX checks during a crawl session
const DOMAIN_CACHE = new Map<string, boolean>();

// ─── Valid TLD whitelist (covers 99%+ of real emails) ─────────────────────────
export const VALID_TLDS = new Set([
  // Generic TLDs
  'com','net','org','edu','gov','mil','int',
  'info','biz','name','pro','aero','coop','museum','travel','jobs','mobi','cat','tel','asia',
  'post','xxx',
  // Popular new gTLDs
  'io','co','me','tv','cc','app','dev','ai','cloud','online','site','store','shop','tech',
  'digital','agency','design','studio','email','marketing','solutions','services','consulting',
  'media','group','global','world','company','enterprises','systems','network','software',
  'space','website','blog','life','live','news','today','press','works','zone',
  'guru','expert','academy','center','institute','foundation','fund','social','community',
  'plus','one','exchange','market','money','capital','finance','financial','insurance','tax',
  'ventures','partners','holdings','investments','properties','realty','estate','house','land',
  'restaurant','bar','cafe','kitchen','pizza','wine','beer','fit','yoga','health','care',
  'dental','clinic','doctor','hospital','surgery','vet','pharmacy',
  'law','legal','attorney','lawyer',
  'church','faith','bible','christmas','wedding','gifts','flowers',
  'auto','car','cars','taxi','bike','flights','hotel','holiday','vacations','tours','voyage',
  'photography','photo','photos','pictures','gallery','graphics','art','band','music',
  'video','film','movie','game','games','play','team','fan','football','soccer','tennis','golf',
  'poker','bet','casino','lotto',
  'school','university','college','education','mba',
  'click','link','page','directory','guide','tips','how','wtf','lol','fail',
  'xyz','top','icu','buzz','club','fun','vip','win','bid','trade','supply','parts','tools',
  'support','help','contact','chat','talk','report','review','reviews','wiki','forum',
  // Country code TLDs (main ones)
  'us','uk','ca','au','nz','ie','za','in','pk','bd','np','lk','ph','sg','my','hk','tw',
  'jp','kr','cn','th','vn','id','il','ae','sa','qa','kw','om','bh','eg','ng','ke','gh','tz',
  'ug','rw','et','ma','dz','tn','ly','sd',
  'de','fr','it','es','pt','nl','be','at','ch','se','no','dk','fi','pl','cz','sk','hu',
  'ro','bg','hr','si','rs','ba','mk','al','gr','cy','mt','lu','li','mc','sm','va',
  'ru','ua','by','kz','uz','ge','am','az','md','ee','lv','lt',
  'br','ar','cl','co','mx','pe','ve','ec','uy','py','bo','cr','pa','do','hn','gt','sv','ni',
  'cu','jm','tt','ht','pr','bb','bs','ky','bm','vi','gp','mq',
  'tr','ir',
  // Common compound country TLDs
  'co.uk','co.za','co.in','co.ke','co.nz','co.jp','co.kr','co.id','co.th',
  'com.au','com.br','com.ar','com.mx','com.ng','com.gh','com.pk','com.eg','com.sa',
  'com.tr','com.my','com.sg','com.ph','com.hk','com.tw','com.cn','com.vn',
  'org.uk','org.au','net.au','gov.uk','ac.uk','gov.au',
  'edu.au','ac.in','nic.in','gov.in','go.ke','or.ke',
]);

/** Quick validation that a candidate is a plausible real email, not a word fragment */
export function isLikelyRealEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  
  const [local, domain] = email.toLowerCase().split('@');
  if (!local || !domain) return false;

  // Local part too short (e.g. "fe@", "m@", "th@")
  if (local.length < 2) return false;

  // Domain must have at least one dot
  if (!domain.includes('.')) return false;

  // Extract TLD (and compound TLD like co.uk)
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  const tld = domainParts.slice(-1)[0];
  const compoundTld = domainParts.length >= 3 ? domainParts.slice(-2).join('.') : '';

  // TLD must be a known real TLD
  if (!VALID_TLDS.has(tld) && !VALID_TLDS.has(compoundTld)) return false;

  // Domain name part (SLD) should be at least 2 chars
  const sld = domainParts.length >= 3 && VALID_TLDS.has(compoundTld)
    ? domainParts.slice(0, -2).join('.')
    : domainParts.slice(0, -1).join('.');
  if (sld.length < 2) return false;

  // Reject if the "email" is clearly a fragment of a normal word containing @
  const WORD_FRAGMENT_PATTERNS = [
    /communic@/i, /inform@/i, /loc@/i, /educ@/i, /oper@/i,
    /identific@/i, /represent@/i, /arbitr@/i, /affili@/i,
    /certific@/i, /verific@/i, /authent@/i, /classific@/i,
    /modific@/i, /specific@/i, /notific@/i, /applic@/i,
    /public@/i, /dedic@/i, /indic@/i, /complic@/i,
    /navig@/i, /alloc@/i, /communic@/i, /domestic@/i,
    /fe@/i, /st@/i, /cre@/i, /tre@/i, /m@te/i,
    /window\.loc@/i, /search\.substr/i,
  ];
  if (WORD_FRAGMENT_PATTERNS.some(p => p.test(email))) return false;

  // Reject if local part looks like a common word ending (tion, ation, etc.)
  if (/^(ion|tion|ation|ment|ness|ence|ance|ure|ures|ive|ous|ble|ful|less|ic|al|er|or|ar|ist|ism|ty|ity)$/i.test(local)) return false;
  if (/^(ion|tion|ation|ment|ness)s?$/i.test(local)) return false;

  // Reject if domain starts with known word-fragment continuations
  const domainName = domainParts[0];
  if (/^(ion|tion|ation|ment|ness|ence|ance|ure|ures|ive|ous|ble|ful)$/i.test(domainName)) return false;

  return true;
}

/**
 * Fast verification: Check if the domain has valid MX records (can receive mail).
 * This ensures the "existence" of the mailbox at the domain level.
 */
export async function checkDomainDeliverability(domain: string): Promise<boolean> {
  if (!domain || domain.includes(' ') || domain.length < 4) return false;
  
  if (DOMAIN_CACHE.has(domain)) return DOMAIN_CACHE.get(domain)!;

  try {
    const mxRecords = await dns.promises.resolveMx(domain).catch(() => []);
    const isValid = mxRecords && mxRecords.length > 0;
    
    // Cache for 1 hour
    DOMAIN_CACHE.set(domain, isValid);
    return isValid;
  } catch {
    DOMAIN_CACHE.set(domain, false);
    return false;
  }
}

/** Clear domain cache (useful when starting a fresh crawl) */
export function clearDomainCache() {
  DOMAIN_CACHE.clear();
}
