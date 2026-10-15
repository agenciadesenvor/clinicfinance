-- =====================================================
-- CLINICFINANCE — CRM: Kanban + Etiquetas
-- Execute em: Supabase Dashboard → SQL Editor → New Query → Run
-- Pode rodar mais de uma vez (não duplica nada).
-- =====================================================

-- 1. Etiquetas (cada conta tem as suas: nome + cor)
create table if not exists public.crm_etiquetas (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  nome        text        not null,
  cor         text        not null default '#B39581',
  ordem       int         not null default 0,
  created_at  timestamptz default now()
);
create index if not exists idx_crm_etiquetas_user on public.crm_etiquetas(user_id);

alter table public.crm_etiquetas enable row level security;
drop policy if exists "crm_etiquetas_select" on public.crm_etiquetas;
drop policy if exists "crm_etiquetas_insert" on public.crm_etiquetas;
drop policy if exists "crm_etiquetas_update" on public.crm_etiquetas;
drop policy if exists "crm_etiquetas_delete" on public.crm_etiquetas;
create policy "crm_etiquetas_select" on public.crm_etiquetas for select using (auth.uid() = user_id);
create policy "crm_etiquetas_insert" on public.crm_etiquetas for insert with check (auth.uid() = user_id);
create policy "crm_etiquetas_update" on public.crm_etiquetas for update using (auth.uid() = user_id);
create policy "crm_etiquetas_delete" on public.crm_etiquetas for delete using (auth.uid() = user_id);

-- 2. Etiquetas de cada paciente (lista de ids das etiquetas)
alter table public.crm_pacientes add column if not exists etiquetas text[] not null default '{}';
create index if not exists idx_crm_pacientes_etiquetas on public.crm_pacientes using gin (etiquetas);
