import { z } from "zod";

export type BrevoConfig = { apiKey: string; senderEmail: string; senderName: string; replyTo?: string };

const sendResponse = z.object({ messageId: z.string() });

/** POST /v3/smtp/email. Devuelve el messageId de Brevo. */
export async function sendBrevoEmail(
  cfg: BrevoConfig,
  email: {
    to: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
    tags: string[];
    unsubscribeUrl: string;
    oneClickUrl: string;
  },
): Promise<string> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "api-key": cfg.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: cfg.senderEmail, name: cfg.senderName },
      to: [email.to],
      ...(cfg.replyTo ? { replyTo: { email: cfg.replyTo } } : {}),
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      tags: email.tags,
      headers: {
        "List-Unsubscribe": `<${email.oneClickUrl}>, <${email.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Brevo falló (${res.status}): ${text.slice(0, 300)}`);
  return sendResponse.parse(JSON.parse(text)).messageId;
}

/** HTML simple → texto plano para textContent. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li)>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
