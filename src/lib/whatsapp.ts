import { createHmac, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "./config";
import { z } from "zod";
export function verifySignature(
  raw: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  const actual = Buffer.from(signature.slice(7), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function equalToken(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
const envelope = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string() }),
                }),
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  id: z.string().min(1).max(300),
                  from: z.string().regex(/^[1-9]\d{9,14}$/),
                  timestamp: z.string().regex(/^\d{10}$/),
                  type: z.string(),
                  text: z.object({ body: z.string().max(4000) }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});
export function parseMessages(payload: unknown, phoneNumberId: string) {
  const parsed = envelope.parse(payload);
  return parsed.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => {
      const value = change.value;
      if (value.metadata.phone_number_id !== phoneNumberId) return [];
      return (value.messages || []).map((message) => ({
        id: message.id,
        phone: message.from,
        sentAt: new Date(Number(message.timestamp) * 1000).toISOString(),
        name:
          value.contacts
            ?.find((c) => c.wa_id === message.from)
            ?.profile.name.slice(0, 100) || "Cliente",
        body:
          message.type === "text" && message.text
            ? message.text.body
            : `[Mídia recebida: ${message.type.slice(0, 40)}]`,
        unsupported: message.type !== "text" || !message.text,
      }));
    }),
  );
}
export async function sendWhatsAppText(phone: string, body: string) {
  const version = requiredEnv("WHATSAPP_API_VERSION");
  const number = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
  if (
    !/^v\d+\.\d+$/.test(version) ||
    !/^\d+$/.test(number) ||
    !/^[1-9]\d{9,14}$/.test(phone)
  )
    throw new Error("whatsapp_config_invalid");
  const response = await fetch(
    `https://graph.facebook.com/${version}/${number}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("WHATSAPP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { preview_url: false, body },
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw new Error(`whatsapp_http_${response.status}`);
  const result = await response.json();
  const id = result.messages?.[0]?.id;
  if (typeof id !== "string") throw new Error("whatsapp_invalid_response");
  return id;
}
export async function readLimitedBody(request: Request, limit = 262144) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
