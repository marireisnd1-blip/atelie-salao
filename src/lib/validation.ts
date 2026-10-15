import { z } from "zod";
export function validRequestOrigin(
  request: Request,
  configuredOrigin?: string,
) {
  const url = new URL(request.url);
  const expected =
    configuredOrigin ||
    `${url.protocol}//${request.headers.get("host") || url.host}`;
  return request.headers.get("origin") === expected;
}
const id = z.uuid();
const startsAt = z.iso.datetime({ offset: true });
export const dashboardAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("book"),
    name: z.string().trim().min(1).max(100),
    phone: z.string().regex(/^[1-9]\d{9,14}$/),
    serviceId: id,
    startsAt,
  }),
  z.object({ action: z.literal("reschedule"), id, startsAt }),
  z.object({
    action: z.literal("appointment_status"),
    id,
    status: z.enum(["cancelled", "completed"]),
  }),
  z.object({ action: z.literal("toggle_ai"), enabled: z.boolean() }),
  z.object({
    action: z.literal("conversation_mode"),
    id,
    mode: z.enum(["ai", "human"]),
  }),
  z.object({
    action: z.literal("create_service"),
    name: z.string().trim().min(1).max(100),
    professional_id: id,
    duration_minutes: z.number().int().min(15).max(480).multipleOf(15),
    price_cents: z.number().int().min(0).max(1000000),
  }),
  z.object({
    action: z.literal("send_message"),
    id,
    body: z.string().trim().min(1).max(2000),
    requestKey: z.uuid(),
  }),
]);
export function bookingConfirmation(text: string) {
  return (
    /^confirmar\s+([a-f0-9]{8})$/i.exec(text.trim())?.[1].toUpperCase() || null
  );
}
export function publicDbError(code: string) {
  if (
    code.includes("exclusion") ||
    code === "23P01" ||
    code.includes("horario_indisponivel")
  )
    return "Esse horário já está ocupado. Escolha outro.";
  if (code.includes("acesso_negado"))
    return "Você não tem permissão para essa ação.";
  if (code.includes("fora_do_expediente"))
    return "Escolha um horário dentro do expediente da profissional.";
  if (code.includes("horario_bloqueado"))
    return "A profissional está indisponível nesse período.";
  if (code.includes("horario_passado")) return "Escolha um horário futuro.";
  if (code.includes("limite_agendamentos"))
    return "A cliente atingiu o limite de agendamentos futuros.";
  if (code.includes("janela_whatsapp_expirada"))
    return "A janela de 24 horas do WhatsApp expirou. Aguarde uma nova mensagem da cliente.";
  if (code.includes("atendimento_ainda_nao_terminou"))
    return "O atendimento só pode ser concluído após seu horário de término.";
  if (code.includes("fora_da_janela"))
    return "Escolha uma data dentro da janela de agendamento do salão.";
  return "Não foi possível concluir. Confira os dados e tente novamente.";
}
