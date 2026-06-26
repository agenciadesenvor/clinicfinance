-- =====================================================
-- CLINICFINANCE — CRM (Fase 1) — tabelas + RLS
-- Execute em: Supabase Dashboard → SQL Editor → New Query
-- =====================================================

-- 1. Pacientes / Leads do CRM
create table if not exists public.crm_pacientes (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  nome           text        not null,
  telefone       text,                       -- usado também para WhatsApp
  email          text,
  cpf            text,
  nascimento     date,
  instagram      text,
  origem         text        default 'outro',     -- instagram, indicacao, google, whatsapp, site, outro
  status         text        default 'novo',      -- funil: novo, contato, agendado, cliente, retorno, inativo
  interesse      text,                       -- procedimento de interesse
  observacoes    text,
  proximo_contato date,                      -- data do próximo follow-up
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 2. Interações (linha do tempo de contatos com o paciente)
create table if not exists public.crm_interacoes (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  paciente_id  uuid        not null references public.crm_pacientes(id) on delete cascade,
  tipo         text        default 'nota',   -- nota, ligacao, whatsapp, presencial, agendamento, retorno
  descricao    text,
  data         date        default current_date,
  created_at   timestamptz default now()
);

-- Índices p/ busca por usuário e por paciente
create index if not exists idx_crm_pacientes_user on public.crm_pacientes(user_id);
create index if not exists idx_crm_interacoes_user on public.crm_interacoes(user_id);
create index if not exists idx_crm_interacoes_paciente on public.crm_interacoes(paciente_id);

-- 3. Row Level Security (cada usuário vê/edita apenas os próprios registros)
alter table public.crm_pacientes  enable row level security;
alter table public.crm_interacoes enable row level security;

create policy "crm_pacientes_select" on public.crm_pacientes for select using (auth.uid() = user_id);
create policy "crm_pacientes_insert" on public.crm_pacientes for insert with check (auth.uid() = user_id);
create policy "crm_pacientes_update" on public.crm_pacientes for update using (auth.uid() = user_id);
create policy "crm_pacientes_delete" on public.crm_pacientes for delete using (auth.uid() = user_id);

create policy "crm_interacoes_select" on public.crm_interacoes for select using (auth.uid() = user_id);
create policy "crm_interacoes_insert" on public.crm_interacoes for insert with check (auth.uid() = user_id);
create policy "crm_interacoes_update" on public.crm_interacoes for update using (auth.uid() = user_id);
create policy "crm_interacoes_delete" on public.crm_interacoes for delete using (auth.uid() = user_id);
