// Approved reminder templates. Compliance signs these off; the AI may only rephrase within them.
export type TemplateId = "ptp_day_before" | "ptp_due_today" | "overdue_gentle" | "broken_followup" | "officer_ptp_today";

export type TemplateVars = {
  name: string;
  loanId: string;
  amount: number;
  date?: string; // YYYY-MM-DD
  branchPhone: string;
  officerName?: string;
};

export const COMPANY = "Company A Finance";

const TEMPLATES: Record<TemplateId, { hi: string; en: string; recipient: "borrower" | "officer" }> = {
  ptp_day_before: {
    recipient: "borrower",
    en: "Namaste {name}. A reminder from {company}: as agreed, ₹{amount} for loan {loanId} is due tomorrow, {date}. If you have already paid, please ignore this. For help, call {branchPhone}.",
    hi: "नमस्ते {name}। {company} की ओर से याद दिला रहे हैं: तय किए अनुसार लोन {loanId} के ₹{amount} कल, {date} को देय हैं। यदि आप भुगतान कर चुके हैं तो कृपया इसे अनदेखा करें। सहायता के लिए {branchPhone} पर कॉल करें।",
  },
  ptp_due_today: {
    recipient: "borrower",
    en: "Namaste {name}. A reminder from {company}: ₹{amount} for loan {loanId} is due today, {date}, as agreed. Thank you. For help, call {branchPhone}.",
    hi: "नमस्ते {name}। {company} की ओर से याद दिला रहे हैं: तय किए अनुसार लोन {loanId} के ₹{amount} आज, {date} को देय हैं। धन्यवाद। सहायता के लिए {branchPhone} पर कॉल करें।",
  },
  overdue_gentle: {
    recipient: "borrower",
    en: "Namaste {name}. Your loan {loanId} with {company} has ₹{amount} overdue. Please pay at your earliest convenience, or call {branchPhone} if you would like to discuss it.",
    hi: "नमस्ते {name}। {company} के साथ आपके लोन {loanId} में ₹{amount} बकाया हैं। कृपया सुविधानुसार जल्द भुगतान करें, या बात करने के लिए {branchPhone} पर कॉल करें।",
  },
  broken_followup: {
    recipient: "borrower",
    en: "Namaste {name}. We have not yet received ₹{amount} for loan {loanId} that was planned for {date}. Please let us know a convenient date by calling {branchPhone}.",
    hi: "नमस्ते {name}। लोन {loanId} के ₹{amount}, जो {date} को तय थे, अभी तक प्राप्त नहीं हुए हैं। कृपया {branchPhone} पर कॉल करके सुविधाजनक तारीख बताएं।",
  },
  officer_ptp_today: {
    recipient: "officer",
    en: "{name} ({loanId}) promised ₹{amount} today. Follow up before 7 pm.",
    hi: "{name} ({loanId}) ने आज ₹{amount} देने का वादा किया है। शाम 7 बजे से पहले फॉलो-अप करें।",
  },
};

export function templateRecipient(id: TemplateId) {
  return TEMPLATES[id].recipient;
}

export function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export function formatDate(date: string, lang: "hi" | "en"): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function fillTemplate(id: TemplateId, lang: "hi" | "en", v: TemplateVars): string {
  return TEMPLATES[id][lang]
    .replaceAll("{name}", v.name)
    .replaceAll("{company}", COMPANY)
    .replaceAll("{loanId}", v.loanId)
    .replaceAll("{amount}", formatInr(v.amount))
    .replaceAll("{date}", v.date ? formatDate(v.date, lang) : "")
    .replaceAll("{branchPhone}", v.branchPhone)
    .replaceAll("{officerName}", v.officerName ?? "");
}

export function templateText(id: TemplateId, lang: "hi" | "en"): string {
  return TEMPLATES[id][lang];
}

// Language a collections message must never use: threats, shaming, third parties, legal pressure.
// RBI's fair practices code forbids intimidation; legal notices are a separate, out-of-scope process.
// A trailing * marks a stem ("humiliat*" also blocks "humiliate", "humiliation").
const BLOCKED_EN = [
  "police", "jail", "prison", "arrest*", "court", "courts", "legal action", "lawyer*", "advocate", "fir", "case against",
  "warrant", "seiz*", "confiscat*", "auction*", "repossess*", "defaulter*", "shame*", "embarrass*", "family", "families",
  "neighbo*", "relative*", "employer*", "consequence*", "last warning", "final warning", "final notice", "threat*", "ruin*",
  "blacklist*", "publish*", "humiliat*", "criminal*", "force", "forced", "punish*", "visit your home", "come to your house",
  "or else", "immediately or",
]
const BLOCKED_HI = [
  "पुलिस", "जेल", "गिरफ्तार", "कोर्ट", "अदालत", "कानूनी कार्रवाई", "कानूनी", "वकील", "मुकदमा", "केस", "एफआईआर", "वारंट",
  "जब्त", "कुर्क", "नीलाम", "डिफॉल्टर", "डिफाल्टर", "बदनाम", "शर्म", "परिवार", "पड़ोसी", "पडोसी", "रिश्तेदार",
  "अंजाम", "परिणाम भुगत", "अंतिम चेतावनी", "आखिरी चेतावनी", "चेतावनी", "धमकी", "सबक", "उठा ले", "घर आ", "वरना", "सजा",
];

/** NFC-normalise, drop the nukta and lower-case, so "ज़ब्त" and "जब्त" or "POLICE" and "police" match the same rule. */
export function normaliseForFilter(s: string): string {
  return s.normalize("NFC").replace(/़/g, "").toLowerCase();
}

export function findBlockedTerms(text: string): string[] {
  const t = normaliseForFilter(text);
  const hits = new Set<string>();
  for (const w of BLOCKED_EN) {
    const stem = w.endsWith("*");
    const body = (stem ? w.slice(0, -1) : w).replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${body}${stem ? "" : "\\b"}`, "i");
    if (re.test(t)) hits.add(w);
  }
  for (const w of BLOCKED_HI) if (t.includes(normaliseForFilter(w))) hits.add(w);
  return [...hits];
}

export type DraftCheck = { ok: true } | { ok: false; problems: string[] };

/**
 * Checks a drafted message before an officer can send it. The AI is allowed to rephrase,
 * never to add facts: every rupee figure must be the real amount, the loan ID must be present,
 * no links or new phone numbers, nothing blocked, and it must stay SMS-sized.
 */
export function checkDraft(text: string, v: TemplateVars, lang: "hi" | "en"): DraftCheck {
  const problems: string[] = [];
  const blocked = findBlockedTerms(text);
  if (blocked.length) problems.push(`blocked_terms:${blocked.join("|")}`);
  if (text.length > 360) problems.push("too_long");
  if (text.trim().length < 40) problems.push("too_short");
  if (!text.includes(v.loanId)) problems.push("missing_loan_id");
  if (/https?:\/\/|www\.|\.com\b|\.in\b|bit\.ly/i.test(text)) problems.push("contains_link");

  const amounts = [...text.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+)/gi)].map((m) => Number(m[1].replace(/,/g, "")));
  if (!amounts.length) problems.push("missing_amount");
  if (amounts.some((a) => a !== v.amount)) problems.push("wrong_amount");

  const allowedDigits = new Set([v.branchPhone.replace(/\D/g, ""), v.loanId.replace(/\D/g, "")]);
  const longNumbers = (text.match(/\d[\d\s-]{8,}\d/g) ?? []).map((n) => n.replace(/\D/g, "")).filter((n) => n.length >= 10);
  if (longNumbers.some((n) => !allowedDigits.has(n))) problems.push("unknown_phone_number");

  if (v.date) {
    const expected = formatDate(v.date, lang);
    const day = String(Number(v.date.slice(8, 10)));
    if (!text.includes(expected) && !text.includes(v.date)) problems.push("missing_or_changed_date");
    // Any other "<day> <month>" style date is a hallucinated date.
    const otherDays = [...text.matchAll(/\b(\d{1,2})\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|जनवरी|फ़रवरी|फरवरी|मार्च|अप्रैल|मई|जून|जुलाई|अगस्त|सितंबर|अक्टूबर|नवंबर|दिसंबर)/gi)].map((m) => m[1]);
    if (otherDays.some((d) => d !== day)) problems.push("missing_or_changed_date");
  }
  return problems.length ? { ok: false, problems: [...new Set(problems)] } : { ok: true };
}
