-- Dados de exemplo opcionais. Não cria usuários de autenticação.
begin;
insert into public.professionals(id,name,color) values
('10000000-0000-4000-8000-000000000001','Ana','#9c6c51'),
('10000000-0000-4000-8000-000000000002','Bia','#75876b'),
('10000000-0000-4000-8000-000000000003','Carla','#9b80a2') on conflict(id) do nothing;
insert into public.services(id,professional_id,name,duration_minutes,price_cents) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Manicure clássica',45,4500),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Esmaltação em gel',60,8500),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Alongamento em gel',120,18000) on conflict(id) do nothing;
insert into public.working_hours(professional_id,weekday,starts_at,ends_at)
select p.id,d,'09:00'::time,'18:00'::time from public.professionals p cross join generate_series(1,6) d
where not exists(select 1 from public.working_hours w where w.professional_id = p.id and w.weekday = d);
commit;
