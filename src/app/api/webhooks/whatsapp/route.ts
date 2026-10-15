import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import {
  equalToken,
  parseMessages,
  readLimitedBody,
  verifySignature,
} from "@/lib/whatsapp";
import { isDemoMode } from "@/lib/config";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (isDemoMode() || !process.env.WHATSAPP_VERIFY_TOKEN)
    return new Response("Integração não configurada", { status: 503 });
  const params = new URL(request.url).searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    equalToken(
      params.get("hub.verify_token") || "",
      process.env.WHATSAPP_VERIFY_TOKEN,
    )
  )
    return new Response(params.get("hub.challenge") || "");
  return new Response("Não autorizado", { status: 403 });
}
export async function POST(request: Request) {
  if (
    isDemoMode() ||
    !process.env.WHATSAPP_APP_SECRET ||
    !process.env.WHATSAPP_PHONE_NUMBER_ID ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  )
    return NextResponse.json(
      { error: "Integração não configurada" },
      { status: 503 },
    );
  let raw: string;
  try {
    raw = await readLimitedBody(request);
  } catch {
    return new Response("Payload muito grande", { status: 413 });
  }
  if (
    !verifySignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      process.env.WHATSAPP_APP_SECRET,
    )
  )
    return new Response("Assinatura inválida", { status: 401 });
  let incoming;
  try {
    incoming = parseMessages(
      JSON.parse(raw),
      process.env.WHATSAPP_PHONE_NUMBER_ID,
    );
  } catch {
    return new Response("Payload inválido", { status: 400 });
  }
  try {
    const db = adminDb();
    for (const message of incoming) {
      const { error } = await db.rpc("receive_message", {
        p_wa_id: message.id,
        p_phone: message.phone,
        p_name: message.name,
        p_body: message.body,
        p_unsupported: message.unsupported,
        p_sent_at: message.sentAt,
      });
      if (error) throw new Error("database_write_failed");
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Falha ao registrar; reenvio necessário" },
      { status: 503 },
    );
  }
}
