"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  MessageCircle,
  Sparkles,
  Settings,
  Plus,
  ArrowUpRight,
  Clock3,
  ChevronRight,
  X,
  LogOut,
  Check,
  Users,
  Leaf,
  Pause,
  Play,
} from "lucide-react";
import type { DashboardData, Appointment } from "@/lib/types";
import { browserDb } from "@/lib/supabase/browser";
const Calendar = dynamic(() => import("./calendar"), {
  ssr: false,
  loading: () => <p className="empty">Carregando agenda…</p>,
});
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const clock = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const localDay = (value = new Date().toISOString()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(value),
  );
const localTime = (value: string) => clock(value);
type Tab = "agenda" | "conversas" | "servicos" | "configuracoes";
const nav = [
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "conversas", label: "Conversas", icon: MessageCircle },
  { id: "servicos", label: "Serviços", icon: Sparkles },
  { id: "configuracoes", label: "Configurações", icon: Settings },
] as const;

export function Dashboard({
  initial,
  demo,
}: {
  initial: DashboardData;
  demo: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("agenda");
  const [professional, setProfessional] = useState("all");
  const [calendar, setCalendar] = useState(false);
  const [modal, setModal] = useState<"appointment" | "service" | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(
    initial.conversations[0]?.id || "",
  );
  useEffect(() => {
    if (demo) {
      try {
        const saved = localStorage.getItem("atelie-demo-v1");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.date === localDay()) setData(parsed.data);
        }
      } catch {
        /* Armazenamento privado indisponível. */
      }
    }
    setLoaded(true);
  }, [demo]);
  useEffect(() => {
    if (demo && loaded) {
      try {
        localStorage.setItem(
          "atelie-demo-v1",
          JSON.stringify({ date: localDay(), data }),
        );
      } catch {
        /* Continua apenas na sessão. */
      }
    }
  }, [data, demo, loaded]);
  useEffect(() => {
    if (!demo) setData(initial);
  }, [initial, demo]);
  useEffect(() => {
    if (demo) return;
    const db = browserDb();
    const channel = db
      .channel("dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [demo, router]);
  const today = data.appointments.filter(
    (a) => localDay(a.starts_at) === localDay() && a.status !== "cancelled",
  );
  const filtered = data.appointments.filter(
    (a) => professional === "all" || a.professional_id === professional,
  );
  const visibleToday = today
    .filter((a) => professional === "all" || a.professional_id === professional)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const conv = data.conversations.find((c) => c.id === conversationId);
  async function action(
    payload: Record<string, unknown>,
    update: (old: DashboardData) => DashboardData,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (demo) setData(update(data));
      else {
        const response = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestKey: crypto.randomUUID(), ...payload }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Não foi possível salvar.");
        router.refresh();
      }
      setNotice(demo ? "Alteração salva na demonstração." : "Alteração salva.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  function newAppointment() {
    setSelected(null);
    setError("");
    setModal("appointment");
  }
  const selectAppointment = (id: string) => {
    setSelected(data.appointments.find((a) => a.id === id) || null);
    setError("");
    setModal("appointment");
  };
  return (
    <div className="app-shell" data-ready={loaded} inert={!loaded}>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">a.</span>
          <span>
            ateliê<span className="brand-caption">AGENDA & ATENDIMENTO</span>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Leaf size={18} />
          </span>
          <div>
            Seu salão<small>Espaço de trabalho</small>
          </div>
          <ChevronRight size={16} />
        </div>
        <p className="nav-label">PRINCIPAL</p>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? "active" : ""}`}
              onClick={() => {
                setTab(item.id);
                setError("");
                setNotice("");
              }}
            >
              <item.icon size={19} />
              {item.label}
              {item.id === "conversas" &&
                data.conversations.some((c) => c.mode === "human") && (
                  <span className="nav-count">
                    {
                      data.conversations.filter((c) => c.mode === "human")
                        .length
                    }
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="assistant-card">
            <span className="assistant-dot" />{" "}
            <strong>
              {data.aiEnabled ? "Assistente disponível" : "Assistente pausada"}
            </strong>
            <p>
              {demo
                ? "Explore o atendimento com dados de exemplo."
                : "A equipe pode assumir uma conversa a qualquer momento."}
            </p>
          </div>
          <div className="profile">
            <span className="avatar">
              {data.userName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{demo ? "Seu espaço de teste" : data.userName}</strong>
              <small>{data.isAdmin ? "Administradora" : "Profissional"}</small>
            </div>
            {!demo && (
              <button
                className="icon-button"
                aria-label="Sair"
                onClick={async () => {
                  await browserDb().auth.signOut();
                  window.location.assign("/login");
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Seu salão <ChevronRight size={14} />{" "}
            <strong>{nav.find((n) => n.id === tab)?.label}</strong>
          </span>
          <span className="topbar-date">
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "long",
              timeZone: "America/Sao_Paulo",
            }).format(new Date())}
          </span>
        </header>
        <div className="page-content">
          {demo && (
            <div className="demo-banner">
              <Sparkles size={16} />
              <span>
                <strong>Modo demonstração.</strong> Dados fictícios; alterações
                ficam neste navegador. Nenhuma mensagem é enviada.
              </span>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">UM CUIDADO A CADA DETALHE</p>
              <h1>
                {tab === "agenda"
                  ? "Um lindo dia de trabalho."
                  : tab === "conversas"
                    ? "Conversas que acolhem."
                    : tab === "servicos"
                      ? "Seu talento, em cada serviço."
                      : "Tudo no seu lugar."}
              </h1>
              <p>
                {tab === "agenda"
                  ? "Organize seus horários e deixe o atendimento fluir."
                  : tab === "conversas"
                    ? "Acompanhe o atendimento e esteja perto de cada cliente."
                    : tab === "servicos"
                      ? "Serviços e profissionais que fazem seu salão acontecer."
                      : "Cuide da assistente e das conexões do salão."}
              </p>
            </div>
            {tab === "agenda" && data.isAdmin && (
              <button className="button primary" onClick={newAppointment}>
                <Plus size={18} />
                Novo agendamento
              </button>
            )}
            {tab === "servicos" && data.isAdmin && (
              <button
                className="button primary"
                onClick={() => setModal("service")}
              >
                <Plus size={18} />
                Novo serviço
              </button>
            )}
          </div>
          {notice && (
            <div role="status" className="notice">
              <Check size={17} />
              {notice}
            </div>
          )}
          {error && !modal && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {tab === "agenda" && (
            <>
              <section className="stats-grid">
                <article className="stat-card">
                  <span>
                    Agendamentos hoje
                    <CalendarDays size={19} />
                  </span>
                  <strong>{today.length.toString().padStart(2, "0")}</strong>
                  <small>
                    <span className="tiny-dot" />{" "}
                    {today.filter((a) => a.status === "confirmed").length}{" "}
                    confirmados para hoje
                  </small>
                </article>
                <article className="stat-card">
                  <span>
                    Valor agendado hoje
                    <ArrowUpRight size={19} />
                  </span>
                  <strong>
                    {money(today.reduce((sum, a) => sum + a.price_cents, 0))}
                  </strong>
                  <small>Estimativa dos serviços · não é caixa</small>
                </article>
                <article className="stat-card">
                  <span>
                    Aguardando a equipe
                    <MessageCircle size={19} />
                  </span>
                  <strong>
                    {data.conversations
                      .filter((c) => c.mode === "human")
                      .length.toString()
                      .padStart(2, "0")}
                  </strong>
                  <small>
                    <button
                      className="text-button"
                      onClick={() => setTab("conversas")}
                    >
                      Ir para conversas <ChevronRight size={13} />
                    </button>
                  </small>
                </article>
              </section>
              <div className="agenda-layout">
                <section className="panel agenda-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Sua agenda</h2>
                      <p>Tempo para cuidar de cada cliente.</p>
                    </div>
                    <div className="segmented">
                      <button
                        className={!calendar ? "selected" : ""}
                        onClick={() => setCalendar(false)}
                      >
                        Hoje
                      </button>
                      <button
                        className={calendar ? "selected" : ""}
                        onClick={() => setCalendar(true)}
                      >
                        Calendário
                      </button>
                    </div>
                  </div>
                  <div className="filter-row">
                    <button
                      className={`filter-chip ${professional === "all" ? "selected" : ""}`}
                      onClick={() => setProfessional("all")}
                    >
                      <Users size={14} />
                      Todas
                    </button>
                    {data.professionals.map((p) => (
                      <button
                        key={p.id}
                        className={`filter-chip ${professional === p.id ? "selected" : ""}`}
                        onClick={() => setProfessional(p.id)}
                      >
                        <i style={{ background: p.color }} />
                        {p.name}
                      </button>
                    ))}
                    <span className="timezone">Horário de Brasília</span>
                  </div>
                  {calendar ? (
                    <div className="calendar-container">
                      <Calendar
                        appointments={filtered}
                        professionals={data.professionals}
                        services={data.services}
                        onSelect={selectAppointment}
                      />
                    </div>
                  ) : (
                    <div className="appointment-list">
                      {visibleToday.length === 0 && (
                        <div className="empty">
                          <CalendarDays size={30} />
                          <h3>Um espaço para novos cuidados.</h3>
                          <p>Nenhum agendamento para este filtro hoje.</p>
                          {data.isAdmin && (
                            <button
                              className="button secondary"
                              onClick={newAppointment}
                            >
                              Agendar um atendimento
                            </button>
                          )}
                        </div>
                      )}
                      {visibleToday.map((a) => {
                        const service = data.services.find(
                          (s) => s.id === a.service_id,
                        );
                        const prof = data.professionals.find(
                          (p) => p.id === a.professional_id,
                        );
                        return (
                          <button
                            className="appointment-row"
                            key={a.id}
                            onClick={() => selectAppointment(a.id)}
                          >
                            <div className="appointment-time">
                              <strong>{clock(a.starts_at)}</strong>
                              <small>{clock(a.ends_at)}</small>
                            </div>
                            <span
                              className="appointment-line"
                              style={{ background: prof?.color }}
                            />
                            <div className="appointment-info">
                              <h3>{a.client_name}</h3>
                              <p>{service?.name}</p>
                              <span>
                                <Clock3 size={12} />
                                {service?.duration_minutes} min <i />
                                {prof?.name}
                              </span>
                            </div>
                            <div className="appointment-meta">
                              <span
                                className={`badge ${a.status === "completed" ? "neutral" : "green"}`}
                              >
                                {a.status === "completed"
                                  ? "Concluído"
                                  : "Confirmado"}
                              </span>
                              <strong>{money(a.price_cents)}</strong>
                            </div>
                            <ChevronRight className="row-chevron" size={17} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="panel-footer">
                    <span>
                      <span className="tiny-dot" />{" "}
                      {demo
                        ? "Agenda de demonstração"
                        : "Atualizações em tempo real"}
                    </span>
                    <span>{visibleToday.length} atendimentos hoje</span>
                  </div>
                </section>
                <aside className="right-column">
                  <section className="care-card">
                    <div className="care-icon">
                      <Leaf size={23} />
                    </div>
                    <p className="eyebrow">MAIS TEMPO PARA O QUE IMPORTA</p>
                    <h2>
                      Você cuida da beleza.
                      <br /> A agenda cuida do resto.
                    </h2>
                    <p>
                      {demo
                        ? "Conheça o painel com tranquilidade. Para receber clientes reais, conecte os serviços nas configurações."
                        : "A assistente consulta os horários disponíveis. A confirmação passa sempre pelas regras da sua agenda."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setTab("configuracoes")}
                    >
                      Ver configurações <ArrowUpRight size={16} />
                    </button>
                    <span className="care-decoration" aria-hidden="true">
                      <Sparkles size={140} strokeWidth={1} />
                    </span>
                  </section>
                  <section className="panel team-panel">
                    <h2>Profissionais</h2>
                    <p>Talentos que fazem acontecer.</p>
                    {data.professionals.map((p) => (
                      <div className="team-row" key={p.id}>
                        <span
                          className="avatar"
                          style={{ background: `${p.color}20`, color: p.color }}
                        >
                          {p.name[0]}
                        </span>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {
                              today.filter((a) => a.professional_id === p.id)
                                .length
                            }{" "}
                            atendimentos hoje
                          </small>
                        </div>
                        <i style={{ background: p.color }} />
                      </div>
                    ))}
                  </section>
                </aside>
              </div>
            </>
          )}
          {tab === "servicos" && (
            <section className="services-grid">
              {data.services.map((s) => (
                <article className="panel service-card" key={s.id}>
                  <Sparkles size={24} />
                  <h2>{s.name}</h2>
                  <p>
                    {
                      data.professionals.find((p) => p.id === s.professional_id)
                        ?.name
                    }{" "}
                    · {s.duration_minutes} minutos
                  </p>
                  <strong>{money(s.price_cents)}</strong>
                  <span className={`badge ${s.active ? "green" : "neutral"}`}>
                    {s.active ? "Disponível" : "Inativo"}
                  </span>
                </article>
              ))}
              {data.services.length === 0 && (
                <p className="empty">Cadastre o primeiro serviço do salão.</p>
              )}
            </section>
          )}
          {tab === "conversas" && (
            <section className="panel conversations-panel">
              <div className="conversation-list">
                <h2>Atendimentos</h2>
                {data.conversations.map((c) => (
                  <button
                    key={c.id}
                    className={conversationId === c.id ? "selected" : ""}
                    onClick={() => setConversationId(c.id)}
                  >
                    <span className="avatar">{c.client_name?.[0]}</span>
                    <span>
                      <strong>{c.client_name}</strong>
                      <small>
                        {c.mode === "human"
                          ? "Com a equipe"
                          : "Com a assistente"}
                      </small>
                    </span>
                  </button>
                ))}
                {!data.conversations.length && (
                  <p className="empty">As novas conversas aparecerão aqui.</p>
                )}
              </div>
              <div className="chat">
                {conv ? (
                  <>
                    <div className="chat-heading">
                      <div>
                        <h2>{conv.client_name}</h2>
                        <p>{conv.reason || "Atendimento do salão"}</p>
                      </div>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          action(
                            {
                              action: "conversation_mode",
                              id: conv.id,
                              mode: conv.mode === "human" ? "ai" : "human",
                            },
                            (old) => ({
                              ...old,
                              conversations: old.conversations.map((c) =>
                                c.id === conv.id
                                  ? {
                                      ...c,
                                      mode: c.mode === "human" ? "ai" : "human",
                                    }
                                  : c,
                              ),
                            }),
                          )
                        }
                      >
                        {conv.mode === "human" ? (
                          <Play size={15} />
                        ) : (
                          <Pause size={15} />
                        )}
                        {conv.mode === "human"
                          ? "Retomar IA"
                          : "Assumir conversa"}
                      </button>
                    </div>
                    <div className="chat-messages">
                      {data.messages
                        .filter((m) => m.conversation_id === conv.id)
                        .map((m) => (
                          <div className={`bubble ${m.direction}`} key={m.id}>
                            {m.body}
                            <small>
                              {clock(m.created_at)}
                              {m.direction === "out" && m.send_state
                                ? ` · ${{ queued: "Na fila", sending: "Enviando", sent: "Enviada", failed: "Envio não confirmado — revisar", cancelled: "Envio cancelado" }[m.send_state]}`
                                : ""}
                            </small>
                          </div>
                        ))}
                    </div>
                    <form
                      className="chat-compose"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.currentTarget;
                        const body = String(new FormData(form).get("body"));
                        const ok = await action(
                          { action: "send_message", id: conv.id, body },
                          (old) => ({
                            ...old,
                            messages: [
                              ...old.messages,
                              {
                                id: crypto.randomUUID(),
                                conversation_id: conv.id,
                                direction: "out",
                                body,
                                created_at: new Date().toISOString(),
                              },
                            ],
                          }),
                        );
                        if (ok) form.reset();
                      }}
                    >
                      <input
                        aria-label="Mensagem para a cliente"
                        name="body"
                        placeholder={
                          conv.mode === "human"
                            ? "Escreva sua mensagem…"
                            : "Assuma a conversa para responder"
                        }
                        maxLength={2000}
                        required
                        disabled={conv.mode !== "human"}
                      />
                      <button
                        className="button primary"
                        disabled={busy || conv.mode !== "human"}
                      >
                        Enviar
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="empty">Selecione um atendimento.</div>
                )}
              </div>
            </section>
          )}
          {tab === "configuracoes" && (
            <section className="settings-grid">
              <article className="panel settings-card">
                <Sparkles size={24} />
                <h2>Assistente do salão</h2>
                <p>
                  Pause o atendimento automático quando precisar. Mensagens
                  recebidas continuam registradas.
                </p>
                <span
                  className={`badge ${data.aiEnabled ? "green" : "neutral"}`}
                >
                  {data.aiEnabled ? "Ativada" : "Pausada"}
                </span>
                {data.isAdmin && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      action(
                        { action: "toggle_ai", enabled: !data.aiEnabled },
                        (old) => ({ ...old, aiEnabled: !old.aiEnabled }),
                      )
                    }
                  >
                    {data.aiEnabled ? "Pausar assistente" : "Ativar assistente"}
                  </button>
                )}
              </article>
              <article className="panel settings-card">
                <Settings size={24} />
                <h2>Conexões do salão</h2>
                <p>
                  {demo
                    ? "Demonstração local. Supabase, WhatsApp e IA não estão sendo usados."
                    : "Modo conectado. A disponibilidade de cada provedor deve ser validada na implantação."}
                </p>
                <ul className="connection-list">
                  <li>
                    Banco e autenticação{" "}
                    <span>{demo ? "Demonstração" : "Supabase"}</span>
                  </li>
                  <li>
                    Canal de atendimento{" "}
                    <span>{demo ? "Não conectado" : "Meta Cloud API"}</span>
                  </li>
                  <li>
                    Inteligência artificial{" "}
                    <span>{demo ? "Não conectada" : "Anthropic"}</span>
                  </li>
                </ul>
              </article>
              {demo && (
                <article className="panel settings-card">
                  <h2>Recomeçar a demonstração</h2>
                  <p>
                    Restaure os exemplos e remova as alterações feitas neste
                    navegador.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      localStorage.removeItem("atelie-demo-v1");
                      setData(initial);
                      setNotice("Demonstração restaurada.");
                    }}
                  >
                    Restaurar exemplos
                  </button>
                </article>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>ateliê · feito para cuidar</span>
            <span>Um atendimento de cada vez.</span>
          </footer>
        </div>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Fechar"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            <p className="eyebrow">CUIDADO COM CADA DETALHE</p>
            <h2 id="modal-title">
              {modal === "service"
                ? "Novo serviço"
                : selected
                  ? "Detalhes do atendimento"
                  : "Novo agendamento"}
            </h2>
            {modal === "appointment" ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  const form = new FormData(e.currentTarget);
                  const serviceId = String(form.get("service"));
                  const service = data.services.find(
                    (s) => s.id === serviceId,
                  )!;
                  const start = new Date(
                    `${form.get("date")}T${form.get("time")}:00-03:00`,
                  );
                  const end = new Date(
                    start.getTime() + service.duration_minutes * 60000,
                  );
                  if (start.getTime() <= Date.now()) {
                    setError("Escolha um horário futuro.");
                    return;
                  }
                  if (
                    demo &&
                    (start.getDay() === 0 ||
                      Number(clock(start.toISOString()).split(":")[0]) < 9 ||
                      Number(clock(end.toISOString()).split(":")[0]) > 18 ||
                      clock(end.toISOString()) > "18:00")
                  ) {
                    setError(
                      "Na demonstração, o expediente é de segunda a sábado, das 9h às 18h.",
                    );
                    return;
                  }
                  if (
                    demo &&
                    data.appointments.some(
                      (a) =>
                        a.id !== selected?.id &&
                        a.professional_id === service.professional_id &&
                        a.status === "confirmed" &&
                        new Date(a.starts_at) < end &&
                        new Date(a.ends_at) > start,
                    )
                  ) {
                    setError("Esse horário já está ocupado. Escolha outro.");
                    return;
                  }
                  const payload = selected
                    ? {
                        action: "reschedule",
                        id: selected.id,
                        startsAt: start.toISOString(),
                      }
                    : {
                        action: "book",
                        serviceId,
                        startsAt: start.toISOString(),
                        name: String(form.get("name")),
                        phone: String(form.get("phone")),
                      };
                  const ok = await action(payload, (old) => ({
                    ...old,
                    appointments: selected
                      ? old.appointments.map((a) =>
                          a.id === selected.id
                            ? {
                                ...a,
                                starts_at: start.toISOString(),
                                ends_at: end.toISOString(),
                              }
                            : a,
                        )
                      : [
                          ...old.appointments,
                          {
                            id: crypto.randomUUID(),
                            client_id: crypto.randomUUID(),
                            client_name: String(form.get("name")),
                            professional_id: service.professional_id,
                            service_id: serviceId,
                            starts_at: start.toISOString(),
                            ends_at: end.toISOString(),
                            status: "confirmed",
                            price_cents: service.price_cents,
                          },
                        ],
                  }));
                  if (ok) setModal(null);
                }}
              >
                <label>
                  Nome da cliente
                  <input
                    name="name"
                    defaultValue={selected?.client_name}
                    required
                    maxLength={100}
                    disabled={Boolean(selected)}
                  />
                </label>
                {!selected && (
                  <label>
                    WhatsApp com DDI e DDD
                    <input
                      name="phone"
                      placeholder="5511999999999"
                      pattern="[1-9][0-9]{9,14}"
                      required
                    />
                  </label>
                )}
                <label>
                  Serviço
                  <select
                    name="service"
                    defaultValue={selected?.service_id || data.services[0]?.id}
                    disabled={Boolean(selected)}
                  >
                    {data.services
                      .filter((s) => s.active || s.id === selected?.service_id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ·{" "}
                          {
                            data.professionals.find(
                              (p) => p.id === s.professional_id,
                            )?.name
                          }
                        </option>
                      ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Dia
                    <input
                      name="date"
                      type="date"
                      required
                      defaultValue={
                        selected ? localDay(selected.starts_at) : localDay()
                      }
                    />
                  </label>
                  <label>
                    Horário de Brasília
                    <input
                      name="time"
                      type="time"
                      step="900"
                      required
                      defaultValue={
                        selected ? localTime(selected.starts_at) : "09:00"
                      }
                    />
                  </label>
                </div>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                {(!selected || selected.status === "confirmed") && (
                  <button
                    className="button primary"
                    disabled={busy || !data.services.length}
                  >
                    {busy
                      ? "Salvando…"
                      : selected
                        ? "Salvar novo horário"
                        : "Confirmar agendamento"}
                  </button>
                )}
                {selected?.status === "confirmed" && (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await action(
                          {
                            action: "appointment_status",
                            id: selected.id,
                            status: "completed",
                          },
                          (old) => ({
                            ...old,
                            appointments: old.appointments.map((a) =>
                              a.id === selected.id
                                ? { ...a, status: "completed" }
                                : a,
                            ),
                          }),
                        );
                        if (ok) setModal(null);
                      }}
                    >
                      Concluir
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await action(
                          {
                            action: "appointment_status",
                            id: selected.id,
                            status: "cancelled",
                          },
                          (old) => ({
                            ...old,
                            appointments: old.appointments.map((a) =>
                              a.id === selected.id
                                ? { ...a, status: "cancelled" }
                                : a,
                            ),
                          }),
                        );
                        if (ok) setModal(null);
                      }}
                    >
                      Cancelar atendimento
                    </button>
                  </div>
                )}
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const service = {
                    id: crypto.randomUUID(),
                    professional_id: String(f.get("professional")),
                    name: String(f.get("name")),
                    duration_minutes: Number(f.get("duration")),
                    price_cents: Math.round(Number(f.get("price")) * 100),
                    active: true,
                  };
                  const ok = await action(
                    { action: "create_service", ...service },
                    (old) => ({ ...old, services: [...old.services, service] }),
                  );
                  if (ok) setModal(null);
                }}
              >
                <label>
                  Nome do serviço
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  Profissional
                  <select name="professional" required>
                    {data.professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Duração (minutos)
                    <input
                      type="number"
                      name="duration"
                      min="15"
                      max="480"
                      step="15"
                      required
                    />
                  </label>
                  <label>
                    Preço (R$)
                    <input
                      type="number"
                      name="price"
                      min="0"
                      max="10000"
                      step="0.01"
                      required
                    />
                  </label>
                </div>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <button className="button primary" disabled={busy}>
                  Salvar serviço
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
