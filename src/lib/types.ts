export type Professional = {
  id: string;
  name: string;
  color: string;
  active: boolean;
};
export type Service = {
  id: string;
  professional_id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
};
export type Appointment = {
  id: string;
  client_id: string | null;
  professional_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled" | "completed";
  price_cents: number;
  client_name?: string;
};
export type Conversation = {
  id: string;
  client_id: string;
  mode: "ai" | "human";
  reason: string | null;
  client_name?: string;
};
export type Message = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
  send_state?: "queued" | "sending" | "sent" | "failed" | "cancelled" | null;
};
export type DashboardData = {
  professionals: Professional[];
  services: Service[];
  appointments: Appointment[];
  conversations: Conversation[];
  messages: Message[];
  aiEnabled: boolean;
  isAdmin: boolean;
  userName: string;
};
