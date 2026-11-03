import { extractEmails } from "../contact";

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 600_000;
/** Sitios que Google pone como "website" pero no son del negocio. */
const SKIP_HOSTS = /(^|\.)(facebook|instagram|twitter|x|tiktok|linktr|wa|whatsapp|google|youtube|linkedin)\.(com|ee|me)$/i;

function isPublicHttpUrl(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname;
  if (h === "localhost" || !h.includes(".")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return false; // IPs literales
  return true;
}

async function fetchHtml(url: URL): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GrowVibeBot/1.0)", Accept: "text/html" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => {});
    return new TextDecoder().decode(Buffer.concat(chunks));
  } catch {
    return null; // timeout, DNS, TLS: el sitio simplemente no aporta email
  }
}

/** Descarga la home y /contacto (máx. 2 páginas, 8 s c/u) y devuelve el mejor email del negocio. */
export async function findWebsiteEmail(website: string): Promise<string | null> {
  let base: URL;
  try {
    base = new URL(website);
  } catch {
    return null;
  }
  if (!isPublicHttpUrl(base) || SKIP_HOSTS.test(base.hostname)) return null;

  const home = await fetchHtml(base);
  let emails = home ? extractEmails(home, base.hostname) : [];
  if (emails.length === 0) {
    const contact = await fetchHtml(contactPageUrl(home, base));
    if (contact) emails = extractEmails(contact, base.hostname);
  }
  return emails[0] ?? null;
}

/** Usa el enlace de contacto que tenga la home (contacto, contactanos, contact-us…); si no hay, /contacto. */
function contactPageUrl(homeHtml: string | null, base: URL): URL {
  if (homeHtml) {
    for (const m of homeHtml.matchAll(/href\s*=\s*["']([^"'#]*contact[^"'#]*)["']/gi)) {
      try {
        const u = new URL(m[1]!, base);
        if (u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "") && isPublicHttpUrl(u)) return u;
      } catch {
        // href inválido: probar el siguiente
      }
    }
  }
  return new URL("/contacto", base);
}
