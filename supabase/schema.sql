-- Esquema del proyecto Supabase "busqueda-laboral" (ref bclqrmeeqssvqovkvvkz), modelo multiusuario.
-- Respaldo 2026-10-08. Para un proyecto vacío: ejecutar completo, y después datos-2026-10-08.sql (solo entorno de pruebas).
-- Nota: en el proyecto de pruebas actual quedaron además las tablas renombradas *_v1 (modelo de un solo dueño),
-- pendientes de borrar con aprobación explícita. No forman parte de este esquema.

-- Resguardo de datos de prueba: se asignan a lamh2903@gmail.com cuando confirma su mail. Sin acceso para usuarios.
create table public.legado_ofertas (
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
create table public.legado_estados (
  job_id text primary key,
  status text not null default 'pendiente' check (status in ('pendiente', 'postulado', 'descartado')),
  archived boolean,
  removed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.legado_ofertas enable row level security;
alter table public.legado_estados enable row level security;
revoke all on public.legado_ofertas, public.legado_estados from anon, authenticated;

-- Perfil de cuenta: plan de cobro. Solo lo modifica el servidor (webhook de Mercado Pago).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'gratis' check (plan in ('gratis', 'pro', 'cancelado')),
  plan_vence_el timestamptz,
  mp_preapproval_id text,
  plan_desde timestamptz,
  creado_el timestamptz not null default now()
);

-- Datos por usuario.
create table public.ofertas (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
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
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.estados (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'postulado', 'descartado')),
  archived boolean,
  removed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table public.manuales (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  bloque text not null check (bloque in ('admin', 'ia', 'odoo')),
  titulo text not null,
  empresa text not null default '',
  modalidad text not null default '',
  url text,
  iso date not null default current_date,
  primary key (user_id, id)
);

create table public.perfil (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cv_nombre text,
  cv_texto text,
  cv_actualizado timestamptz,
  -- Lo escribe el agente: {resumen, seniority, fortalezas[], oportunidades[], palabras_clave:{admin[],ia[],odoo[]}}
  analisis jsonb,
  analisis_actualizado timestamptz,
  analisis_de_cv timestamptz
);

alter table public.profiles enable row level security;
alter table public.ofertas enable row level security;
alter table public.estados enable row level security;
alter table public.manuales enable row level security;
alter table public.perfil enable row level security;

create policy profiles_leer on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy ofertas_leer on public.ofertas
  for select to authenticated using ((select auth.uid()) = user_id);
create policy estados_propios on public.estados
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy manuales_propios on public.manuales
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy perfil_propio on public.perfil
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.ofertas, public.estados, public.manuales, public.perfil from anon;
grant select on public.profiles to authenticated;
grant select on public.ofertas to authenticated;
grant select, insert, update, delete on public.estados, public.manuales to authenticated;
-- La app solo escribe el CV; el análisis lo escribe el agente (service role).
grant select on public.perfil to authenticated;
grant insert (user_id, cv_nombre, cv_texto, cv_actualizado) on public.perfil to authenticated;
grant update (user_id, cv_nombre, cv_texto, cv_actualizado) on public.perfil to authenticated;

-- Registro de consentimientos: solo se agregan filas (sin update ni delete para el usuario).
create table public.consentimientos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('terminos_privacidad', 'cv_ia_transferencia')),
  version text not null,
  origen text not null check (origen in ('registro', 'carga_cv')),
  aceptado_el timestamptz not null default now()
);
create index consentimientos_user_idx on public.consentimientos (user_id);
alter table public.consentimientos enable row level security;
create policy consentimientos_leer on public.consentimientos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy consentimientos_agregar on public.consentimientos
  for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.consentimientos from anon;
grant select, insert on public.consentimientos to authenticated;

-- Constancia de cada solicitud de arrepentimiento (Resolución 424/2020). Solo las crea el servidor
-- (función mp-arrepentimiento). Se conserva aunque se elimine la cuenta (user_id queda en null).
create table public.solicitudes_arrepentimiento (
  numero_reclamo text primary key default ('ARR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  plan text,
  mp_preapproval_id text,
  motivo text,
  solicitado_el timestamptz not null default now(),
  estado text not null default 'pendiente_reintegro' check (estado in ('pendiente_reintegro', 'reintegrado', 'rechazada'))
);
alter table public.solicitudes_arrepentimiento enable row level security;
create policy arrepentimiento_propio on public.solicitudes_arrepentimiento
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.solicitudes_arrepentimiento from anon, authenticated;
grant select on public.solicitudes_arrepentimiento to authenticated;

-- Alta de cuenta: crea el perfil. Al confirmarse el mail del dueño de pruebas, hereda los datos de prueba.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := new.raw_user_meta_data ->> 'acepto_tyc_version';
begin
  if v is null or length(trim(v)) = 0 then
    raise exception 'Para crear la cuenta tenés que aceptar los Términos y Condiciones y la Política de Privacidad.';
  end if;
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  insert into public.consentimientos (user_id, tipo, version, origen)
    values (new.id, 'terminos_privacidad', left(v, 40), 'registro');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.reclamar_datos_de_prueba()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null and lower(new.email) = 'lamh2903@gmail.com' then
    insert into public.ofertas (user_id, id, bloque, titulo, empresa, modalidad, salario, iso, url, enlace, nuevo, prio, archivado, motivo, created_at)
      select new.id, id, bloque, titulo, empresa, modalidad, salario, iso, url, enlace, nuevo, prio, archivado, motivo, created_at
      from public.legado_ofertas
      on conflict do nothing;
    insert into public.estados (user_id, job_id, status, archived, removed, updated_at)
      select new.id, job_id, status, archived, removed, updated_at
      from public.legado_estados
      on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.reclamar_datos_de_prueba() from public, anon, authenticated;
create trigger reclamar_datos_de_prueba
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.reclamar_datos_de_prueba();

-- Plan vencido: la tarea diaria baja a 'cancelado' los planes Pro cuyo vencimiento ya pasó
-- (cancelaciones voluntarias al terminar el período pagado, o cobros fallidos que vencieron la gracia de 10 días).
create or replace function public.bajar_planes_vencidos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.profiles
     set plan = 'cancelado'
   where plan = 'pro' and plan_vence_el is not null and plan_vence_el < now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.bajar_planes_vencidos() from public, anon, authenticated;
create extension if not exists pg_cron;
select cron.schedule('bajar-planes-vencidos', '0 6 * * *', 'select public.bajar_planes_vencidos()');

alter publication supabase_realtime add table public.estados, public.perfil, public.profiles, public.consentimientos;
