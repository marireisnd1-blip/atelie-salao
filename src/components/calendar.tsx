"use client";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import ptBr from "@fullcalendar/core/locales/pt-br";
import type { Appointment, Professional, Service } from "@/lib/types";
export default function Calendar({
  appointments,
  professionals,
  services,
  onSelect,
}: {
  appointments: Appointment[];
  professionals: Professional[];
  services: Service[];
  onSelect: (id: string) => void;
}) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
      locale={ptBr}
      timeZone="America/Sao_Paulo"
      initialView="timeGridWeek"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "timeGridDay,timeGridWeek,dayGridMonth",
      }}
      allDaySlot={false}
      slotMinTime="07:00:00"
      slotMaxTime="21:00:00"
      height="auto"
      nowIndicator
      weekends
      eventClick={(info) => onSelect(info.event.id)}
      events={appointments
        .filter((a) => a.status !== "cancelled")
        .map((a) => ({
          id: a.id,
          title: `${a.client_name} · ${services.find((s) => s.id === a.service_id)?.name || "Atendimento"}`,
          start: a.starts_at,
          end: a.ends_at,
          backgroundColor: professionals.find((p) => p.id === a.professional_id)
            ?.color,
          borderColor: "transparent",
        }))}
    />
  );
}
