import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/config";
import { demoData } from "@/lib/demo";
import { serverDb } from "@/lib/supabase/server";
import { Dashboard } from "@/components/dashboard";
import type { DashboardData } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (isDemoMode()) return <Dashboard initial={demoData()} demo />;
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return (
      <main className="setup-screen">
        <p className="eyebrow">ATELIÊ · CONFIGURAÇÃO</p>
        <h1>Vamos conectar seu salão.</h1>
        <p>
          Configure o Supabase conforme o README ou use APP_MODE=demo para
          explorar com dados fictícios.
        </p>
      </main>
    );
  const db = await serverDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const [
    team,
    professionals,
    services,
    appointments,
    clients,
    conversations,
    messages,
    settings,
  ] = await Promise.all([
    db
      .from("team_members")
      .select("role, professional_id")
      .eq("id", user.id)
      .single(),
    db.from("professionals").select("*"),
    db.from("services").select("*"),
    db
      .from("appointments")
      .select("*")
      .gte("starts_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .lte("starts_at", new Date(Date.now() + 61 * 86400000).toISOString())
      .order("starts_at"),
    db.from("clients").select("id,name"),
    db.from("conversations").select("*"),
    db
      .from("messages")
      .select("id,conversation_id,direction,body,created_at,send_state")
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("salon_settings").select("ai_enabled").eq("id", true).single(),
  ]);
  if (
    [
      team,
      professionals,
      services,
      appointments,
      clients,
      conversations,
      messages,
      settings,
    ].some((r) => r.error)
  )
    return (
      <main className="setup-screen">
        <h1>Não foi possível carregar o salão.</h1>
        <p>
          Verifique se as migrações foram aplicadas e se seu usuário está
          cadastrado na equipe.
        </p>
      </main>
    );
  const names = new Map(clients.data!.map((c) => [c.id, c.name]));
  const data: DashboardData = {
    professionals: professionals.data!,
    services: services.data!,
    appointments: appointments.data!.map((a) => ({
      ...a,
      client_name: names.get(a.client_id) || "Cliente removida",
    })),
    conversations: conversations.data!.map((c) => ({
      ...c,
      client_name: names.get(c.client_id) || "Cliente",
    })),
    messages: messages.data!.reverse(),
    aiEnabled: settings.data!.ai_enabled,
    isAdmin: team.data!.role === "admin",
    userName: user.email || "Equipe",
  };
  return <Dashboard initial={data} demo={false} />;
}
