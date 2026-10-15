import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "../config";
// Importado apenas por rotas de servidor e pelo worker. Nunca por componentes client.
export function adminDb() {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
