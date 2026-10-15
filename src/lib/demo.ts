import type { DashboardData } from "./types";
export function demoData(): DashboardData {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const at = (hour: string) => `${date}T${hour}:00-03:00`;
  return {
    professionals: [
      { id: "p1", name: "Ana", color: "#9c6c51", active: true },
      { id: "p2", name: "Bia", color: "#75876b", active: true },
      { id: "p3", name: "Carla", color: "#9b80a2", active: true },
    ],
    services: [
      {
        id: "s1",
        professional_id: "p1",
        name: "Manicure clássica",
        duration_minutes: 45,
        price_cents: 4500,
        active: true,
      },
      {
        id: "s2",
        professional_id: "p2",
        name: "Esmaltação em gel",
        duration_minutes: 60,
        price_cents: 8500,
        active: true,
      },
      {
        id: "s3",
        professional_id: "p3",
        name: "Alongamento em gel",
        duration_minutes: 120,
        price_cents: 18000,
        active: true,
      },
    ],
    appointments: [
      {
        id: "a1",
        client_id: "c1",
        client_name: "Marina Costa",
        professional_id: "p1",
        service_id: "s1",
        starts_at: at("09:00"),
        ends_at: at("09:45"),
        status: "confirmed",
        price_cents: 4500,
      },
      {
        id: "a2",
        client_id: "c2",
        client_name: "Juliana Alves",
        professional_id: "p2",
        service_id: "s2",
        starts_at: at("10:00"),
        ends_at: at("11:00"),
        status: "confirmed",
        price_cents: 8500,
      },
      {
        id: "a3",
        client_id: "c3",
        client_name: "Camila Santos",
        professional_id: "p3",
        service_id: "s3",
        starts_at: at("13:00"),
        ends_at: at("15:00"),
        status: "confirmed",
        price_cents: 18000,
      },
      {
        id: "a4",
        client_id: "c4",
        client_name: "Fernanda Lima",
        professional_id: "p1",
        service_id: "s1",
        starts_at: at("15:00"),
        ends_at: at("15:45"),
        status: "completed",
        price_cents: 4500,
      },
    ],
    conversations: [
      {
        id: "conv1",
        client_id: "c1",
        client_name: "Marina Costa",
        mode: "human",
        reason: "Cliente pediu para falar com a equipe",
      },
    ],
    messages: [
      {
        id: "m1",
        conversation_id: "conv1",
        direction: "in",
        body: "Oi! Queria tirar uma dúvida sobre meu atendimento.",
        created_at: at("08:40"),
      },
      {
        id: "m2",
        conversation_id: "conv1",
        direction: "out",
        body: "Claro, Marina! Vou chamar uma pessoa da equipe para te ajudar. 🌷",
        created_at: at("08:41"),
      },
    ],
    aiEnabled: true,
    isAdmin: true,
    userName: "Demonstração",
  };
}
