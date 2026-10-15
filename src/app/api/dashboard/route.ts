import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/config";
import {
  dashboardAction,
  publicDbError,
  validRequestOrigin,
} from "@/lib/validation";
export async function POST(request: NextRequest) {
  if (!validRequestOrigin(request, process.env.APP_ORIGIN))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  if (isDemoMode())
    return NextResponse.json(
      { error: "A demonstração usa apenas dados locais." },
      { status: 403 },
    );
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return NextResponse.json(
      { error: "Banco não configurado." },
      { status: 503 },
    );
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Entre novamente para continuar." },
      { status: 401 },
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = dashboardAction.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Confira os campos informados." },
      { status: 400 },
    );
  const p = parsed.data;
  let result;
  switch (p.action) {
    case "book":
      result = await db.rpc("manual_book", {
        p_name: p.name,
        p_phone: p.phone,
        p_service: p.serviceId,
        p_starts: p.startsAt,
      });
      break;
    case "reschedule":
      result = await db.rpc("staff_appointment", {
        p_id: p.id,
        p_starts: p.startsAt,
      });
      break;
    case "appointment_status":
      result = await db.rpc("staff_appointment", {
        p_id: p.id,
        p_status: p.status,
      });
      break;
    case "toggle_ai":
      result = await db.rpc("set_ai", { p_enabled: p.enabled });
      break;
    case "conversation_mode":
      result = await db.rpc("set_conversation_mode", {
        p_id: p.id,
        p_mode: p.mode,
      });
      break;
    case "create_service":
      result = await db.rpc("create_service", {
        p_name: p.name,
        p_professional: p.professional_id,
        p_duration: p.duration_minutes,
        p_price: p.price_cents,
      });
      break;
    case "send_message":
      result = await db.rpc("enqueue_human_message", {
        p_conversation: p.id,
        p_body: p.body,
        p_key: p.requestKey,
      });
      break;
  }
  if (result.error)
    return NextResponse.json(
      { error: publicDbError(`${result.error.code} ${result.error.message}`) },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
