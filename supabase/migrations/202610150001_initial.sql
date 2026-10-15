begin;
create extension if not exists btree_gist;

create table public.salon_settings (
  id boolean primary key default true check (id),
  ai_enabled boolean not null default false,
  salon_name text not null default 'Salão de unhas',
  min_notice_minutes integer not null default 60 check (min_notice_minutes >= 0),
  booking_window_days integer not null default 60 check (booking_window_days between 1 and 365),
  max_future_bookings integer not null default 3 check (max_future_bookings between 1 and 20),
  max_messages_hour integer not null default 30 check (max_messages_hour between 1 and 200)
);
insert into public.salon_settings(id) values (true);
create table public.professionals (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 100),
  color text not null default '#75876b' check (color ~ '^#[0-9a-fA-F]{6}$'), active boolean not null default true
);
create table public.team_members (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','employee')),
  professional_id uuid references public.professionals(id),
  check (role = 'admin' or professional_id is not null)
);
create table public.services (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professionals(id),
  name text not null check (length(name) between 1 and 100),
  duration_minutes integer not null check (duration_minutes between 15 and 480 and duration_minutes % 15 = 0),
  price_cents integer not null check (price_cents between 0 and 1000000), active boolean not null default true
);
create table public.clients (
  id uuid primary key default gen_random_uuid(), phone text unique not null check (phone ~ '^[1-9][0-9]{9,14}$'),
  name text not null default 'Cliente' check (length(name) between 1 and 100),
  accepts_messages boolean not null default true, privacy_notice_at timestamptz, created_at timestamptz not null default now()
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(), client_id uuid not null unique references public.clients(id) on delete cascade,
  mode text not null default 'ai' check (mode in ('ai','human')), reason text,
  assigned_professional_id uuid references public.professionals(id), updated_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')), body text not null check (length(body) <= 4000),
  wa_message_id text unique, source_key text unique, origin text check (origin in ('ai','human','system')),
  send_state text check (send_state in ('queued','sending','sent','failed','cancelled')),
  customer_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.messages(conversation_id, created_at desc);
create table public.working_hours (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professionals(id),
  weekday integer not null check (weekday between 0 and 6), starts_at time not null, ends_at time not null,
  check (starts_at < ends_at),
  exclude using gist (professional_id with =, weekday with =, int4range(extract(epoch from starts_at)::int, extract(epoch from ends_at)::int, '[)') with &&)
);
create table public.blocks (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professionals(id),
  starts_at timestamptz not null, ends_at timestamptz not null, reason text,
  check (starts_at < ends_at)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(), client_id uuid references public.clients(id) on delete set null,
  professional_id uuid not null references public.professionals(id), service_id uuid not null references public.services(id),
  starts_at timestamptz not null, ends_at timestamptz not null, price_cents integer not null check (price_cents >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  created_at timestamptz not null default now(), check (starts_at < ends_at),
  exclude using gist (professional_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status = 'confirmed')
);
create index on public.appointments(client_id, starts_at);
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid, entity_id uuid not null,
  action text not null, created_at timestamptz not null default now()
);
-- A mensagem é registrada antes do HTTP 200. O worker é reiniciável.
create table public.inbound_jobs (
  id uuid primary key default gen_random_uuid(), message_id uuid not null unique references public.messages(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','done','failed')),
  attempts integer not null default 0, locked_at timestamptz, last_error text, created_at timestamptz not null default now()
);
create table public.booking_intents (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete cascade,
  code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  kind text not null check (kind in ('book','reschedule','cancel')),
  service_id uuid references public.services(id), appointment_id uuid references public.appointments(id), starts_at timestamptz,
  request_key text not null unique, expires_at timestamptz not null default now() + interval '15 minutes',
  confirmed_id uuid references public.appointments(id), unique(client_id,code)
);

create function public.is_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from team_members where id = auth.uid() and role = 'admin');
$$;
create function public.my_professional() returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select professional_id from team_members where id = auth.uid();
$$;
create function public.is_team() returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from team_members where id = auth.uid());
$$;
create function public.can_access_client(p_client uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select is_admin() or exists(select 1 from appointments where client_id = p_client and professional_id = my_professional())
    or exists(select 1 from conversations where client_id = p_client and assigned_professional_id = my_professional());
$$;

-- Uma trava curta serializa alterações de agenda, expediente e bloqueios.
create function public.validate_calendar() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare s services; local_start timestamp; local_end timestamp;
begin
  perform pg_advisory_xact_lock(74101);
  if tg_table_name = 'appointments' then
    if new.status <> 'confirmed' then return new; end if;
    if tg_op = 'UPDATE' and new.starts_at = old.starts_at and new.ends_at = old.ends_at and new.service_id = old.service_id and new.professional_id = old.professional_id then return new; end if;
    select * into s from services where id = new.service_id and active;
    if s.id is null or s.professional_id <> new.professional_id or not exists(select 1 from professionals where id = new.professional_id and active) then raise exception 'servico_invalido'; end if;
    if new.starts_at <= now() then raise exception 'horario_passado'; end if;
    if new.ends_at <> new.starts_at + make_interval(mins => s.duration_minutes) then raise exception 'duracao_invalida'; end if;
    local_start := new.starts_at at time zone 'America/Sao_Paulo'; local_end := new.ends_at at time zone 'America/Sao_Paulo';
    if local_start::date <> local_end::date or extract(second from local_start) <> 0 or extract(minute from local_start)::int % 15 <> 0 then raise exception 'horario_invalido'; end if;
    if not exists(select 1 from working_hours where professional_id = new.professional_id and weekday = extract(dow from local_start) and starts_at <= local_start::time and ends_at >= local_end::time) then raise exception 'fora_do_expediente'; end if;
    if exists(select 1 from blocks where professional_id = new.professional_id and tstzrange(starts_at,ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then raise exception 'horario_bloqueado'; end if;
  elsif tg_table_name = 'blocks' then
    if exists(select 1 from appointments where professional_id = new.professional_id and status = 'confirmed' and tstzrange(starts_at,ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then raise exception 'bloqueio_conflita_agendamento'; end if;
  elsif tg_table_name = 'working_hours' then
    -- Mudanças de expediente exigem resolver os agendamentos futuros antes.
    if tg_op <> 'INSERT' and exists(select 1 from appointments where professional_id = old.professional_id and status = 'confirmed' and starts_at > now() and extract(dow from starts_at at time zone 'America/Sao_Paulo') = old.weekday) then raise exception 'expediente_com_agendamentos'; end if;
    if tg_op = 'DELETE' then return old; end if;
  end if;
  return new;
end;
$$;
create trigger validate_appointment before insert or update on public.appointments for each row execute function public.validate_calendar();
create trigger validate_block before insert or update on public.blocks for each row execute function public.validate_calendar();
create trigger validate_working_hours before insert or update or delete on public.working_hours for each row execute function public.validate_calendar();
create function public.audit_appointment() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into audit_log(actor_id,entity_id,action) values(auth.uid(),new.id,case when tg_op = 'INSERT' then 'created' when old.status <> new.status then new.status else 'rescheduled' end);
  return new;
end; $$;
create trigger audit_appointment after insert or update on public.appointments for each row execute function public.audit_appointment();

-- Políticas de leitura; escritas passam por funções restritas.
alter table public.salon_settings enable row level security;
alter table public.professionals enable row level security;
alter table public.team_members enable row level security;
alter table public.services enable row level security;
alter table public.clients enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.working_hours enable row level security;
alter table public.blocks enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_log enable row level security;
alter table public.inbound_jobs enable row level security;
alter table public.booking_intents enable row level security;
create policy team_settings on public.salon_settings for select to authenticated using (is_team());
create policy team_professionals on public.professionals for select to authenticated using (is_team());
create policy team_services on public.services for select to authenticated using (is_team());
create policy own_profile on public.team_members for select to authenticated using (id = auth.uid() or is_admin());
create policy own_clients on public.clients for select to authenticated using (can_access_client(id));
create policy own_conversations on public.conversations for select to authenticated using (is_admin() or assigned_professional_id = my_professional() or exists(select 1 from appointments where client_id = conversations.client_id and professional_id = my_professional()));
create policy own_messages on public.messages for select to authenticated using (exists(select 1 from conversations where id = messages.conversation_id));
create policy own_appointments on public.appointments for select to authenticated using (is_admin() or professional_id = my_professional());
create policy own_hours on public.working_hours for select to authenticated using (is_admin() or professional_id = my_professional());
create policy own_blocks on public.blocks for select to authenticated using (is_admin() or professional_id = my_professional());
create policy admin_audit on public.audit_log for select to authenticated using (is_admin());

create function public.available_slots(p_service uuid, p_date date) returns table(starts_at timestamptz) language sql stable security definer set search_path = public, pg_temp as $$
  select slot from services s join professionals p on p.id = s.professional_id join working_hours w on w.professional_id = p.id
  cross join salon_settings cfg
  cross join lateral generate_series((p_date + w.starts_at) at time zone 'America/Sao_Paulo', (p_date + w.ends_at) at time zone 'America/Sao_Paulo' - make_interval(mins => s.duration_minutes), interval '15 minutes') slot
  where s.id = p_service and s.active and p.active and w.weekday = extract(dow from p_date)
    and slot >= now() + make_interval(mins => cfg.min_notice_minutes) and p_date <= (now() at time zone 'America/Sao_Paulo')::date + cfg.booking_window_days
    and not exists(select 1 from appointments a where a.professional_id = p.id and a.status = 'confirmed' and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(slot,slot + make_interval(mins => s.duration_minutes),'[)'))
    and not exists(select 1 from blocks b where b.professional_id = p.id and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(slot,slot + make_interval(mins => s.duration_minutes),'[)')) order by slot limit 40;
$$;
create function public.book_internal(p_client uuid,p_service uuid,p_starts timestamptz) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare s services; cfg salon_settings; result uuid;
begin
  perform pg_advisory_xact_lock(74101);
  select * into cfg from salon_settings;
  if p_starts > now() + make_interval(days => cfg.booking_window_days) then raise exception 'fora_da_janela'; end if;
  if (select count(*) from appointments where client_id = p_client and status = 'confirmed' and starts_at > now()) >= cfg.max_future_bookings then raise exception 'limite_agendamentos'; end if;
  select * into s from services where id = p_service and active;
  if s.id is null then raise exception 'servico_invalido'; end if;
  insert into appointments(client_id, professional_id,service_id,starts_at,ends_at,price_cents) values(p_client,s.professional_id,s.id,p_starts,p_starts + make_interval(mins => s.duration_minutes),s.price_cents) returning id into result;
  return result;
end; $$;
create function public.manual_book(p_name text,p_phone text,p_service uuid,p_starts timestamptz) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid;
begin
  if not is_admin() then raise exception 'acesso_negado'; end if;
  insert into clients(name,phone) values(p_name,p_phone) on conflict(phone) do update set name = excluded.name returning id into c;
  return book_internal(c,p_service,p_starts);
end; $$;
create function public.staff_appointment(p_id uuid,p_status text default null,p_starts timestamptz default null) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare a appointments; duration interval;
begin
  perform pg_advisory_xact_lock(74101);
  select * into a from appointments where id = p_id for update;
  if a.id is null or not is_team() or not (is_admin() or a.professional_id = my_professional()) then raise exception 'acesso_negado'; end if;
  if a.status <> 'confirmed' then raise exception 'agendamento_encerrado'; end if;
  if p_status is not null then
    if p_status not in ('cancelled','completed') then raise exception 'status_invalido'; end if;
    if p_status = 'completed' and a.ends_at > now() then raise exception 'atendimento_ainda_nao_terminou'; end if;
    update appointments set status = p_status where id = p_id;
  elsif p_starts is not null then
    if a.starts_at <= now() then raise exception 'horario_passado'; end if;
    select make_interval(mins => duration_minutes) into duration from services where id = a.service_id;
    if p_starts > now() + make_interval(days => (select booking_window_days from salon_settings)) then raise exception 'fora_da_janela'; end if;
    update appointments set starts_at = p_starts, ends_at = p_starts + duration where id = p_id;
  else raise exception 'operacao_invalida'; end if;
end; $$;
create function public.set_ai(p_enabled boolean) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin if not is_admin() then raise exception 'acesso_negado'; end if; update salon_settings set ai_enabled = p_enabled; end; $$;
create function public.set_conversation_mode(p_id uuid,p_mode text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_team() or not exists(select 1 from conversations where id = p_id and can_access_client(client_id)) then raise exception 'acesso_negado'; end if;
  if p_mode not in ('ai','human') then raise exception 'modo_invalido'; end if;
  update conversations set mode = p_mode, assigned_professional_id = coalesce(my_professional(),assigned_professional_id), updated_at = now() where id = p_id;
end; $$;
create function public.create_service(p_name text,p_professional uuid,p_duration integer,p_price integer) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare result uuid;
begin
  if not is_admin() then raise exception 'acesso_negado'; end if;
  insert into services(name,professional_id,duration_minutes,price_cents) values(p_name,p_professional,p_duration,p_price) returning id into result; return result;
end; $$;
create function public.enqueue_human_message(p_conversation uuid,p_body text,p_key text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_team() or not exists(select 1 from conversations where id = p_conversation and mode = 'human' and can_access_client(client_id)) then raise exception 'acesso_negado'; end if;
  if length(p_body) not between 1 and 2000 then raise exception 'mensagem_invalida'; end if;
  if not exists(select 1 from messages where conversation_id = p_conversation and direction = 'in' and customer_sent_at > now() - interval '24 hours') then raise exception 'janela_whatsapp_expirada'; end if;
  if exists(select 1 from conversations c join clients cl on cl.id=c.client_id where c.id=p_conversation and cl.privacy_notice_at is null) then
    p_body := 'Usamos seu nome e telefone para organizar o atendimento e a agenda. Você pode pedir acesso, exclusão dos seus dados ou falar com a equipe a qualquer momento.' || chr(10) || chr(10) || p_body;
  end if;
  insert into messages(conversation_id,direction,body,origin,send_state,source_key) values(p_conversation,'out',p_body,'human','queued',p_key) on conflict(source_key) do nothing;
end; $$;

-- Exclusivo do backend. O telefone é extraído do envelope assinado da Meta.
create function public.receive_message(p_wa_id text,p_phone text,p_name text,p_body text,p_unsupported boolean default false,p_sent_at timestamptz default now()) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid; conv uuid; msg uuid; job uuid; over_limit boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone,0));
  if p_sent_at is null or p_sent_at > now() + interval '5 minutes' then raise exception 'timestamp_invalido'; end if;
  if exists(select 1 from messages where wa_message_id = p_wa_id) then return null; end if;
  insert into clients(phone,name) values(p_phone,left(coalesce(nullif(p_name,''),'Cliente'),100)) on conflict(phone) do update set phone = excluded.phone returning id into c;
  insert into conversations(client_id) values(c) on conflict(client_id) do update set updated_at = now() returning id into conv;
  select count(*) >= (select max_messages_hour from salon_settings) into over_limit from messages where conversation_id = conv and direction = 'in' and created_at > now() - interval '1 hour';
  insert into messages(conversation_id,direction,body,wa_message_id,customer_sent_at) values(conv,'in',left(p_body,4000),p_wa_id,p_sent_at) returning id into msg;
  if p_unsupported then update conversations set mode = 'human',reason = 'Mídia recebida: atendimento humano necessário' where id = conv; end if;
  insert into inbound_jobs(message_id,status) values(msg,case when over_limit or p_unsupported or p_sent_at < now() - interval '24 hours' then 'done' else 'queued' end) returning id into job;
  return job;
end; $$;
create function public.claim_job() returns setof public.inbound_jobs language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update conversations c set mode = 'human',reason = 'Processamento interrompido; equipe deve revisar'
    where exists(select 1 from inbound_jobs j join messages m on m.id = j.message_id where m.conversation_id = c.id and j.status = 'processing' and j.attempts >= 3 and j.locked_at < now() - interval '3 minutes');
  update inbound_jobs set status = 'failed',last_error = 'worker_interrupted' where status = 'processing' and attempts >= 3 and locked_at < now() - interval '3 minutes';
  return query with candidate as (
    select j.id from inbound_jobs j join messages m on m.id = j.message_id
    where (j.status = 'queued' or (j.status = 'processing' and j.locked_at < now() - interval '3 minutes')) and j.attempts < 3
      and not exists(select 1 from inbound_jobs other join messages om on om.id = other.message_id where other.id <> j.id and om.conversation_id = m.conversation_id and other.status = 'processing' and other.locked_at >= now() - interval '3 minutes')
      and not exists(select 1 from inbound_jobs earlier join messages em on em.id = earlier.message_id where earlier.id <> j.id and em.conversation_id = m.conversation_id and earlier.status in ('queued','processing') and (earlier.created_at,earlier.id) < (j.created_at,j.id))
    order by j.created_at,j.id for update of j skip locked limit 1
  ) update inbound_jobs j set status = 'processing',attempts = j.attempts+1,locked_at = now() from candidate where j.id = candidate.id returning j.*;
end; $$;
create function public.finish_job(p_job uuid,p_reply text default null,p_error text default null,p_handoff boolean default false) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare conv uuid;
begin
  select m.conversation_id into conv from inbound_jobs j join messages m on m.id = j.message_id where j.id = p_job;
  if p_error is not null then
    update inbound_jobs set status = 'failed',last_error = left(p_error,60) where id = p_job;
    update conversations set mode = 'human',reason = 'Falha no atendimento automático; equipe deve revisar' where id = conv;
    return;
  end if;
  if p_reply is not null and (p_handoff or (exists(select 1 from conversations where id = conv and mode = 'ai') and (select ai_enabled from salon_settings))) then
    insert into messages(conversation_id,direction,body,origin,send_state,source_key) values(conv,'out',left(p_reply,4000),case when p_handoff then 'system' else 'ai' end,'queued',p_job::text) on conflict(source_key) do nothing;
  end if;
  update inbound_jobs set status = 'done',last_error = null where id = p_job;
end; $$;
create function public.claim_outbound() returns setof public.messages language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update messages m set send_state = 'cancelled' from conversations c where m.conversation_id = c.id and m.send_state = 'queued' and
    ((m.origin = 'ai' and (c.mode <> 'ai' or not (select ai_enabled from salon_settings))) or (m.origin = 'human' and c.mode <> 'human') or not exists(select 1 from messages recent where recent.conversation_id = c.id and recent.direction = 'in' and recent.customer_sent_at > now() - interval '24 hours'));
  return query with candidate as (select id from messages where send_state = 'queued' order by created_at for update skip locked limit 1)
    update messages m set send_state = 'sending' from candidate where m.id = candidate.id returning m.*;
end; $$;
create function public.handoff(p_phone text,p_reason text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin update conversations set mode = 'human',reason = left(p_reason,200) where client_id = (select id from clients where phone = p_phone); end; $$;
create function public.set_opt_out(p_phone text) returns void language sql security definer set search_path = public, pg_temp as $$
  update clients set accepts_messages = false where phone = p_phone;
$$;
create function public.prepare_intent(p_phone text,p_kind text,p_key text,p_service uuid default null,p_starts timestamptz default null,p_appointment uuid default null) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid; a appointments; s services; intent booking_intents;
begin
  select id into c from clients where phone = p_phone;
  if c is null then raise exception 'cliente_invalida'; end if;
  if p_kind in ('cancel','reschedule') then
    select * into a from appointments where id = p_appointment and client_id = c and status = 'confirmed' and starts_at > now();
    if a.id is null then raise exception 'agendamento_nao_encontrado'; end if;
  end if;
  if p_kind in ('book','reschedule') then
    select * into s from services where id = coalesce(a.service_id,p_service) and active;
    if s.id is null or p_starts is null or not exists(select 1 from available_slots(s.id,(p_starts at time zone 'America/Sao_Paulo')::date) where starts_at = p_starts) then raise exception 'horario_indisponivel'; end if;
  end if;
  insert into booking_intents(client_id,kind,service_id,appointment_id,starts_at,request_key) values(c,p_kind,coalesce(a.service_id,p_service),p_appointment,p_starts,p_key)
    on conflict(request_key) do update set request_key = excluded.request_key returning * into intent;
  return jsonb_build_object('confirmacao', 'CONFIRMAR ' || intent.code, 'expira_em',intent.expires_at,'tipo',intent.kind,'servico',s.name,'inicio',intent.starts_at,'preco_centavos',s.price_cents);
end; $$;
create function public.confirm_intent(p_phone text,p_code text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare intent booking_intents; result uuid; a appointments; s services; c uuid;
begin
  perform pg_advisory_xact_lock(74101);
  select id into c from clients where phone = p_phone;
  select * into intent from booking_intents where client_id = c and code = upper(p_code) for update;
  if intent.id is null then raise exception 'confirmacao_invalida'; end if;
  if intent.confirmed_id is not null then return jsonb_build_object('id',intent.confirmed_id,'tipo',intent.kind,'ja_confirmado',true); end if;
  if intent.expires_at < now() then raise exception 'confirmacao_expirada'; end if;
  if not (select ai_enabled from salon_settings) or not exists(select 1 from conversations where client_id = c and mode = 'ai') then raise exception 'ia_pausada'; end if;
  if intent.kind = 'book' then
    if intent.starts_at < now() + make_interval(mins => (select min_notice_minutes from salon_settings)) then raise exception 'antecedencia_invalida'; end if;
    result := book_internal(c,intent.service_id,intent.starts_at);
  else
    select * into a from appointments where id = intent.appointment_id and client_id = c and status = 'confirmed' and starts_at > now() for update;
    if a.id is null then raise exception 'agendamento_nao_encontrado'; end if;
    result := a.id;
    if intent.kind = 'cancel' then update appointments set status = 'cancelled' where id = a.id;
    else
      if intent.starts_at < now() + make_interval(mins => (select min_notice_minutes from salon_settings)) or intent.starts_at > now() + make_interval(days => (select booking_window_days from salon_settings)) then raise exception 'horario_invalido'; end if;
      select * into s from services where id = a.service_id;
      update appointments set starts_at = intent.starts_at,ends_at = intent.starts_at + make_interval(mins => s.duration_minutes) where id = a.id;
    end if;
  end if;
  update booking_intents set confirmed_id = result where id = intent.id;
  return jsonb_build_object('id',result,'tipo',intent.kind);
end; $$;
create function public.delete_client(p_client uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'acesso_negado'; end if;
  delete from clients where id = p_client;
  -- Agendamentos ficam sem identificação; mensagens, intenções e jobs são removidos por cascade.
end; $$;

-- Restringir somente os objetos desta aplicação, preservando outros objetos do projeto.
do $$
declare t text; f record;
begin
  foreach t in array array['salon_settings','professionals','team_members','services','clients','conversations','messages','working_hours','blocks','appointments','audit_log','inbound_jobs','booking_intents'] loop
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(array['is_admin','my_professional','is_team','can_access_client','validate_calendar','audit_appointment','available_slots','book_internal','manual_book','staff_appointment','set_ai','set_conversation_mode','create_service','enqueue_human_message','receive_message','claim_job','finish_job','claim_outbound','handoff','set_opt_out','prepare_intent','confirm_intent','delete_client']) loop
    execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant usage on schema public to authenticated,service_role;
grant select on public.salon_settings,public.professionals,public.team_members,public.services,public.clients,public.conversations,public.messages,public.working_hours,public.blocks,public.appointments,public.audit_log to authenticated;
grant execute on function public.is_admin(),public.my_professional(),public.is_team(),public.can_access_client(uuid) to authenticated;
grant execute on function public.manual_book(text,text,uuid,timestamptz),public.staff_appointment(uuid,text,timestamptz),public.set_ai(boolean),public.set_conversation_mode(uuid,text),public.create_service(text,uuid,integer,integer),public.enqueue_human_message(uuid,text,text),public.delete_client(uuid) to authenticated;
grant usage,select on sequence public.audit_log_id_seq to service_role;
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments,public.conversations,public.messages;
  end if;
end $$;
commit;
