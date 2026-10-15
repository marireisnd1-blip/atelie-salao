export function isDemoMode() {
  return process.env.APP_MODE === "demo";
}
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "")
    throw new Error(`Configuração ausente: ${name}`);
  return value;
}
export function integrationStatus() {
  const ready = (...names: string[]) =>
    names.every((name) => Boolean(process.env[name]));
  return {
    supabase: ready(
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
    ai: ready("SALON_ANTHROPIC_KEY", "ANTHROPIC_MODEL"),
    whatsapp: ready(
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_VERIFY_TOKEN",
      "WHATSAPP_API_VERSION",
    ),
  };
}
