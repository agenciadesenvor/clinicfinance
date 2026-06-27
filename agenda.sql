-- =====================================================
-- CLINICFINANCE — AGENDA (Fase 2.1) — tabela + RLS
-- Execute em: Supabase Dashboard → SQL Editor → New Query
-- =====================================================

create table if not exists public.agendamentos (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  paciente_id     uuid        references public.crm_pacientes(id) on delete set null,
  paciente_nome   text        not null,
  procedimento    text,
  data            date        not null,
  hora_inicio     time,
  hora_fim        time,
  status          text        default 'agendado',  -- agendado, confirmado, realizado, cancelado
  observacoes     text,
  google_event_id text,                            -- preenchido na Fase 2.2 (sync Google Calendar)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_agendamentos_user on public.agendamentos(user_id);
create index if not exists idx_agendamentos_data on public.agendamentos(user_id, data);

alter table public.agendamentos enable row level security;

create policy "agendamentos_select" on public.agendamentos for select using (auth.uid() = user_id);
create policy "agendamentos_insert" on public.agendamentos for insert with check (auth.uid() = user_id);
create policy "agendamentos_update" on public.agendamentos for update using (auth.uid() = user_id);
create policy "agendamentos_delete" on public.agendamentos for delete using (auth.uid() = user_id);
