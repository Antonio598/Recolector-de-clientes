import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Teléfono de Google ("229 123 4567", "+52 229 123 4567") → E.164 "+522291234567", o null si no es válido. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const phone = parsePhoneNumberFromString(raw, "MX");
  if (!phone || !phone.isValid()) return null;
  return phone.number;
}

// ───────────── emails en HTML ─────────────

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

/** Dominios/patrones que aparecen en el HTML pero no son del negocio. */
const JUNK_DOMAINS = [
  "wix.com", "wixpress.com", "sentry.io", "sentry-next.wixpress.com", "sentry.wixpress.com",
  "example.com", "ejemplo.com", "domain.com", "dominio.com", "email.com", "correo.com", "tudominio.com",
  "yourdomain.com", "mysite.com", "godaddy.com", "squarespace.com", "wordpress.com", "w3.org",
  "schema.org", "googleapis.com", "google.com", "facebook.com", "instagram.com", "cloudflare.com",
];
const JUNK_LOCAL = /^(noreply|no-reply|donotreply|user|usuario|nombre|name|test|ejemplo|example|your|tu|info@example)$/i;
const FILE_EXT = /\.(png|jpe?g|gif|webp|svg|css|js|ico|woff2?)$/i;

function isJunk(email: string): boolean {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if (FILE_EXT.test(email)) return true; // logo@2x.png
  if (JUNK_LOCAL.test(local)) return true;
  if (/^[0-9a-f]{16,}$/.test(local)) return true; // ids hexadecimales (sentry)
  return JUNK_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Extrae emails del HTML (texto y mailto:), descarta los de terceros y ordena:
 * primero los del mismo dominio que el sitio web.
 */
export function extractEmails(html: string, siteHost?: string): string[] {
  const decoded = html
    .replace(/&#64;|&commat;|\[at\]|\(at\)/gi, "@")
    .replace(/%40/g, "@")
    .replace(/\\u0040/g, "@");
  const found = new Set<string>();
  for (const m of decoded.matchAll(EMAIL_RE)) {
    const email = m[0].toLowerCase().replace(/^[._-]+|[._-]+$/g, "");
    if (!isJunk(email)) found.add(email);
  }
  const host = siteHost?.toLowerCase().replace(/^www\./, "");
  return [...found].sort((a, b) => {
    const am = host && a.endsWith(`@${host}`) ? 0 : 1;
    const bm = host && b.endsWith(`@${host}`) ? 0 : 1;
    return am - bm;
  });
}
