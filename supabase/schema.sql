-- Esquema del proyecto Supabase "busqueda-laboral" (ref bclqrmeeqssvqovkvvkz). Respaldo 2026-10-08.
-- Orden: ejecutar completo en un proyecto vacío.

-- Solo el dueño de la app puede usar los datos.
create or replace function public.es_dueno()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'email') = 'lamh2903@gmail.com', false)
$$;
revoke execute on function public.es_dueno() from public, anon;
grant execute on function public.es_dueno() to authenticated;

-- Proyecto dedicado: solo el dueño puede registrarse, y su cuenta queda confirmada al crearse.
create or replace function public.solo_dueno_se_registra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) is distinct from 'lamh2903@gmail.com' then
    raise exception 'Registro cerrado';
  end if;
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;
revoke execute on function public.solo_dueno_se_registra() from public, anon, authenticated;
create trigger solo_dueno_se_registra
  before insert on auth.users
  for each row execute function public.solo_dueno_se_registra();

create table public.ofertas (
  id text primary key,
  bloque text not null check (bloque in ('admin', 'ia', 'odoo')),
  titulo text not null,
  empresa text not null default '',
  modalidad text not null default '',
  salario text,
  iso date,
  url text,
  enlace text,
  nuevo boolean not null default false,
  prio integer,
  archivado boolean not null default false,
  motivo text,
  created_at timestamptz not null default now()
);

create table public.estados (
  job_id text primary key,
  status text not null default 'pendiente' check (status in ('pendiente', 'postulado', 'descartado')),
  archived boolean,
  removed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.manuales (
  id text primary key,
  bloque text not null check (bloque in ('admin', 'ia', 'odoo')),
  titulo text not null,
  empresa text not null default '',
  modalidad text not null default '',
  url text,
  iso date not null default current_date
);

create table public.perfil (
  id text primary key default 'principal' check (id = 'principal'),
  cv_nombre text,
  cv_texto text,
  cv_actualizado timestamptz,
  -- Lo escribe el agente: {resumen, seniority, fortalezas[], oportunidades[], palabras_clave:{admin[],ia[],odoo[]}}
  analisis jsonb,
  analisis_actualizado timestamptz,
  analisis_de_cv timestamptz
);

alter table public.ofertas enable row level security;
alter table public.estados enable row level security;
alter table public.manuales enable row level security;
alter table public.perfil enable row level security;

create policy ofertas_leer on public.ofertas
  for select to authenticated using ((select public.es_dueno()));
create policy estados_todo on public.estados
  for all to authenticated
  using ((select public.es_dueno())) with check ((select public.es_dueno()));
create policy manuales_todo on public.manuales
  for all to authenticated
  using ((select public.es_dueno())) with check ((select public.es_dueno()));
create policy perfil_todo on public.perfil
  for all to authenticated
  using ((select public.es_dueno())) with check ((select public.es_dueno()));

revoke all on public.ofertas, public.estados, public.manuales, public.perfil from anon;
grant select on public.ofertas to authenticated;
grant select, insert, update, delete on public.estados, public.manuales to authenticated;
-- La app solo escribe el CV; el análisis lo escribe el agente.
grant select on public.perfil to authenticated;
grant insert (id, cv_nombre, cv_texto, cv_actualizado) on public.perfil to authenticated;
grant update (id, cv_nombre, cv_texto, cv_actualizado) on public.perfil to authenticated;

alter publication supabase_realtime add table public.estados, public.perfil;
