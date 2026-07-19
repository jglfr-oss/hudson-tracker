// ═══ T1D Pulse — shared configuration ════════════════════════════════════════
// Central place for search terms, feed lists, category keywords, source
// credibility weights, safety keywords, and time windows. Pure data only —
// no network calls — so it is safe to import anywhere (including tests).

// Content published in the last 7 days is preferred; older than 30 days is
// rejected unless nothing newer exists (see scoring.applyRecencyCutoff).
export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Per-source request timeout (ms). One slow platform must never stall the rest.
export const SOURCE_TIMEOUT_MS = 8000;

// Aggregate cache lifetime (~15 min).
export const CACHE_TTL_SECONDS = 15 * 60;
export const CACHE_KEY = "t1d-pulse-cache-v1";

// Max items returned per tab from the API. The client shows 10 and reveals the
// rest behind "Show more".
export const MAX_ITEMS_PER_TAB = 30;

// News search topics (spec-mandated).
export const NEWS_SEARCH_TERMS = [
  "type 1 diabetes",
  "T1D",
  "continuous glucose monitor",
  "CGM",
  "insulin pump",
  "automated insulin delivery",
  "artificial pancreas",
  "diabetes technology",
  "type 1 diabetes research",
  "type 1 diabetes clinical trial",
];

// Social search topics (spec-mandated).
export const SOCIAL_SEARCH_TERMS = [
  "type 1 diabetes",
  "T1D",
  "Dexcom",
  "Omnipod",
  "insulin pump",
  "CGM",
  "automated insulin delivery",
];

// Words that positively indicate Type 1 relevance.
export const T1D_KEYWORDS = [
  "type 1 diabetes",
  "type 1 diabetic",
  "type1 diabetes",
  "t1d",
  "t1dm",
  "juvenile diabetes",
  "insulin pump",
  "automated insulin delivery",
  "artificial pancreas",
  "closed loop",
  "hybrid closed loop",
  "cgm",
  "continuous glucose",
  "dexcom",
  "omnipod",
  "libre",
  "tandem",
  "tslim",
  "control-iq",
  "islet cell",
  "beta cell",
  "teplizumab",
  "tzield",
];

// Words that indicate the piece is *about* Type 2 diabetes.
export const T2D_KEYWORDS = [
  "type 2 diabetes",
  "type 2 diabetic",
  "type2 diabetes",
  "t2d",
  "prediabetes",
  "pre-diabetes",
  "ozempic",
  "wegovy",
  "semaglutide",
  "metformin",
  "insulin resistance",
];

// Category detection. Order matters: first matching category wins. "community"
// is assigned by adapter for social posts and is not keyword-detected here.
export const CATEGORY_KEYWORDS = {
  research: [
    "research", "study", "trial", "clinical", "cure", "islet", "beta cell",
    "stem cell", "immunotherapy", "teplizumab", "tzield", "vaccine",
    "biomarker", "genetic", "prevention", "screening",
  ],
  devices: [
    "dexcom", "omnipod", "libre", "tandem", "tslim", "medtronic", "cgm",
    "continuous glucose monitor", "sensor", "insulin pump", "patch pump",
    "pen", "device", "wearable", "g7", "g6",
  ],
  technology: [
    "automated insulin delivery", "artificial pancreas", "closed loop",
    "control-iq", "algorithm", "app", "software", "ai", "artificial intelligence",
    "bluetooth", "smart", "digital health", "interoperable",
  ],
  treatment: [
    "insulin", "dosing", "dose", "basal", "bolus", "glucagon", "therapy",
    "treatment", "management", "a1c", "hba1c", "time in range", "hypoglycemia",
    "hyperglycemia", "ketoacidosis", "dka",
  ],
};

// Source credibility weights (0..1) used in news ranking. Higher = more
// authoritative. Institutional/regulatory sources rank above general news.
export const CREDIBILITY = {
  institutional: 1.0, // FDA, NIH, CDC, ADA, Breakthrough T1D
  journal: 0.9, // PubMed / peer-reviewed
  majorNews: 0.7, // Reuters, AP, major outlets (via Google News)
  news: 0.55, // other news publications
  community: 0.2, // social posts / individual creators
};

// Curated, reputable news feeds. RSS/Atom only. `credibility` drives ranking;
// `verifiedSource` marks professional/institutional origins. Google News query
// feeds are legal to consume and surface real, recent articles from many
// publishers (deduped downstream). Institutional feeds are listed first.
export const NEWS_FEEDS = [
  {
    source: "FDA",
    platform: "rss",
    url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml",
    verifiedSource: true,
    credibility: CREDIBILITY.institutional,
    defaultCategory: "treatment",
  },
  {
    source: "NIH News Releases",
    platform: "rss",
    url: "https://www.nih.gov/news-events/news-releases/feed.xml",
    verifiedSource: true,
    credibility: CREDIBILITY.institutional,
    defaultCategory: "research",
  },
  {
    source: "Breakthrough T1D",
    platform: "rss",
    url: "https://www.breakthrought1d.org/feed/",
    verifiedSource: true,
    credibility: CREDIBILITY.institutional,
    defaultCategory: "research",
  },
  // Google News topic queries — reliable, always-available aggregate of real
  // publisher articles. `q` is URL-encoded at fetch time.
  {
    source: "Google News",
    platform: "googlenews",
    query: "\"type 1 diabetes\" research",
    verifiedSource: true,
    credibility: CREDIBILITY.majorNews,
    defaultCategory: "research",
  },
  {
    source: "Google News",
    platform: "googlenews",
    query: "\"type 1 diabetes\" (CGM OR \"insulin pump\" OR Dexcom OR Omnipod)",
    verifiedSource: true,
    credibility: CREDIBILITY.majorNews,
    defaultCategory: "devices",
  },
  {
    source: "Google News",
    platform: "googlenews",
    query: "\"automated insulin delivery\" OR \"artificial pancreas\"",
    verifiedSource: true,
    credibility: CREDIBILITY.majorNews,
    defaultCategory: "technology",
  },
  {
    source: "Google News",
    platform: "googlenews",
    query: "\"type 1 diabetes\" clinical trial",
    verifiedSource: true,
    credibility: CREDIBILITY.majorNews,
    defaultCategory: "research",
  },
];

// Reddit communities to sample when credentials are configured.
export const REDDIT_SUBREDDITS = [
  "diabetes_t1",
  "Type1Diabetes",
  "dexcom",
  "Omnipod",
];

// Unsafe-content patterns. Items matching these are rejected from output (not
// the whole source). Keep conservative to avoid over-blocking legitimate news.
export const UNSAFE_PATTERNS = [
  /\bstop(?:ping)?\s+(?:taking\s+)?insulin\b/i,
  /\bquit(?:ting)?\s+insulin\b/i,
  /\bskip(?:ping)?\s+(?:your\s+)?insulin\b/i,
  /\bno\s+more\s+insulin\b/i,
  /\bcome?\s+off\s+insulin\b/i,
  /\bmiracle\s+cure\b/i,
  /\breverse\s+(?:your\s+)?type\s*1\b/i,
  /\bcure\s+type\s*1\s+(?:with|using)\b/i,
  /\b(?:cinnamon|okra|apple\s+cider\s+vinegar|herbal)\s+.{0,20}\bcure\b/i,
  /\binsulin\s+is\s+(?:poison|a\s+scam|dangerous)\b/i,
];

// ── Distressing content ──────────────────────────────────────────────────────
// This feed is visible to a child living with T1D. Medical-scare stories, death
// and hospitalization narratives, and despair posts are filtered out. This is a
// tone filter, not a censorship one: ordinary struggle ("rough night", "high
// again", "burnt out") stays, because seeing others manage hard days is the
// point of a community feed. What goes is content that frightens without
// helping — near-death accounts, ICU stories, and hopelessness.
export const DISTRESSING_PATTERNS = [
  // Death and near-death
  /\b(?:almost|nearly)\s+(?:died|killed|lost\s+(?:him|her|them|my))\b/i,
  /\bcould\s+have\s+died\b/i,
  /\bwould\s+have\s+died\b/i,
  /\b(?:passed\s+away|died|death)\b.{0,40}\b(?:diabet|t1d|insulin|dka|low\s+blood)/i,
  /\b(?:diabet|t1d|dka|insulin)\b.{0,40}\b(?:passed\s+away|died|death|fatal)\b/i,
  /\bdead\s+in\s+bed\b/i,
  /\bfound\s+(?:him|her|them|unresponsive)\b.{0,30}\bunresponsive\b/i,
  /\bdidn'?t\s+wake\s+up\b/i,
  /\bRIP\b.{0,30}\b(?:t1d|type\s*1|diabet)/i,

  // Emergency / hospitalization narratives
  /\b(?:seizure|seizing|convulsion)s?\b/i,
  /\b(?:coma|comatose)\b/i,
  /\bICU\b/i,
  /\bintensive\s+care\b/i,
  /\blife\s+support\b/i,
  /\bambulance\b/i,
  /\bparamedics?\b/i,
  /\b(?:911|999|emergency\s+room|ER\s+visit)\b/i,
  /\bglucagon\s+(?:emergency|rescue|had\s+to)\b/i,
  /\bunresponsive\b/i,
  /\bbrain\s+damage\b/i,

  // Despair and hopelessness
  /\bwant\s+to\s+(?:die|give\s+up)\b/i,
  /\bcan'?t\s+do\s+this\s+anymore\b/i,
  /\bhopeless\b/i,
  /\bruined\s+my\s+life\b/i,
  /\blife\s+sentence\b/i,
  /\bwish\s+I\s+(?:didn'?t\s+have|never)\b/i,
  /\bself[\s-]?harm\b/i,
  /\bsuicid/i,

  // Fear-driven complication framing (not neutral research reporting)
  /\b(?:lost|losing|amputat)\w*\s+(?:a\s+)?(?:foot|feet|leg|toes?|limb)/i,
  /\bgoing\s+blind\b/i,
  /\bkidney\s+failure\b/i,
  /\bdialysis\b/i,
  /\bterrifying\b/i,
  /\bhorror\s+stor/i,
  /\bworst\s+nightmare\b/i,
];
