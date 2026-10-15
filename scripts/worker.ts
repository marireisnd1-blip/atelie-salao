import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
try {
  loadEnvFile(".env.local");
} catch {
  /* Ambiente pode injetar as variáveis. */
}
const { adminDb } = await import("../src/lib/supabase/admin");
const { answerMessage } = await import("../src/lib/assistant");
const { sendWhatsAppText } = await import("../src/lib/whatsapp");
if (process.env.APP_MODE === "demo") {
  console.log("Modo demonstração: worker não envia mensagens.");
  process.exit(0);
}
const db = adminDb();
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
console.log(
  "Worker iniciado. Conteúdo de mensagens e credenciais não são registrados.",
);
while (running) {
  try {
    const { data: outbound, error: outError } = await db.rpc("claim_outbound");
    if (outError) throw new Error("claim_outbound_failed");
    for (const message of outbound || []) {
      try {
        const { data: conv, error: convError } = await db
          .from("conversations")
          .select("client_id")
          .eq("id", message.conversation_id)
          .single();
        if (convError) throw new Error("conversation_missing");
        const { data: client, error: clientError } = await db
          .from("clients")
          .select("phone")
          .eq("id", conv.client_id)
          .single();
        if (clientError) throw new Error("client_missing");
        const waId = await sendWhatsAppText(client.phone, message.body);
        const { error } = await db
          .from("messages")
          .update({ wa_message_id: waId, send_state: "sent" })
          .eq("id", message.id);
        if (error) throw new Error("outbound_record_failed");
        await db
          .from("clients")
          .update({ privacy_notice_at: new Date().toISOString() })
          .eq("id", conv.client_id)
          .is("privacy_notice_at", null);
      } catch {
        // Um timeout pode ter ocorrido após a Meta aceitar: nunca reenviar automaticamente.
        await db
          .from("messages")
          .update({ send_state: "failed" })
          .eq("id", message.id);
        console.error("Envio não confirmado; revisão humana necessária.");
      }
    }
    const { data: jobs, error } = await db.rpc("claim_job");
    if (error) throw new Error("claim_job_failed");
    for (const job of jobs || []) {
      try {
        const reply = await answerMessage(job.message_id);
        const { error } = await db.rpc("finish_job", {
          p_job: job.id,
          p_reply: typeof reply === "string" ? reply : reply?.text || null,
          p_handoff: (typeof reply === "object" && reply?.handedOff) || false,
        });
        if (error) throw new Error("finish_job_failed");
      } catch {
        const { error } = await db.rpc("finish_job", {
          p_job: job.id,
          p_error: "assistant_processing_failed",
        });
        if (error) console.error("Falha ao registrar resultado do job.");
      }
    }
    if (!jobs?.length && !outbound?.length) await delay(1500);
  } catch {
    console.error("Conexão do worker indisponível; nova tentativa em 5s.");
    await delay(5000);
  }
}
