-- =====================================================
-- CLINICFINANCE — ÍRIS (secretária com IA) — fase 1: tabelas + reserva de horário
-- Execute em: Supabase Dashboard → SQL Editor → New Query → Run
-- Pode rodar mais de uma vez (não duplica nada).
-- O alerta de "operação destrutiva" é só pelos "drop policy if exists" (tabelas novas).
-- =====================================================

-- 1. Configuração da Íris (uma linha por conta)
create table if not exists public.iris_config (
  user_id               uuid        primary key references auth.users(id) on delete cascade,
  modo                  text        not null default 'supervisionado' check (modo in ('supervisionado','automatico')),
  horarios              jsonb       not null default '{"semana":{"1":{"inicio":"09:00","fim":"18:00"},"2":{"inicio":"09:00","fim":"18:00"},"3":{"inicio":"09:00","fim":"18:00"},"4":{"inicio":"09:00","fim":"18:00"},"5":{"inicio":"09:00","fim":"18:00"},"6":{"inicio":"09:00","fim":"12:00"}},"almoco":{"inicio":"12:00","fim":"13:00"},"excecoes":[]}'::jsonb,
  endereco              text        not null default '',
  como_chegar           text        not null default '',
  formas_pagamento      text        not null default '',
  politica_cancelamento text        not null default '',
  politica_atraso       text        not null default '',
  nunca_dizer           text        not null default '',
  frase_emergencia      text        not null default '',
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- 2. Manual dos procedimentos (o que a Íris pode dizer sobre cada um)
create table if not exists public.iris_manual (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  chave          text        not null,
  nome           text,
  ordem          int,
  o_que_e        text        default '',
  indicacao      text        default '',
  preparo        text        default '',
  cuidados       text        default '',
  informa_preco  boolean     default false,
  preco_texto    text        default '',
  duracao_min    int,
  agenda_direto  boolean     default false,
  sinal_centavos int,
  aprovado       boolean     default false,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (user_id, chave)
);

-- 3. Promoções vigentes
create table if not exists public.iris_promocoes (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  procedimento_chave text,
  descricao          text        not null,
  valido_ate         date        not null,
  created_at         timestamptz default now()
);

-- 4. Conversas
create table if not exists public.iris_conversas (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  paciente_id      uuid        references public.crm_pacientes(id) on delete set null,
  canal            text        check (canal in ('simulador','whatsapp')),
  contato_nome     text,
  contato_telefone text,
  estado           text        default 'iris' check (estado in ('iris','equipe')),
  equipe_desde     timestamptz,
  qualificacao     jsonb       default '{}'::jsonb,
  processando_ate  timestamptz,
  ultima_em        timestamptz default now(),
  created_at       timestamptz default now()
);

-- 5. Mensagens
create table if not exists public.iris_mensagens (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  conversa_id      uuid        references public.iris_conversas(id) on delete cascade,
  autor            text        check (autor in ('paciente','iris','equipe','sistema')),
  texto            text        not null,
  status           text        default 'enviada' check (status in ('rascunho','enviada','descartada')),
  fora_expediente  boolean     default false,
  revisada         boolean     default false,
  meta             jsonb       default '{}'::jsonb,
  created_at       timestamptz default now()
);

-- 6. Pendências para a equipe
create table if not exists public.iris_pendencias (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  conversa_id  uuid        references public.iris_conversas(id) on delete cascade,
  motivo       text,
  resumo       text,
  urgente      boolean     default false,
  status       text        default 'aberta' check (status in ('aberta','resolvida')),
  resolvida_em timestamptz,
  created_at   timestamptz default now()
);

-- 7. Reservas de horário (seguram o horário até o sinal ser pago)
create table if not exists public.iris_reservas (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  conversa_id    uuid        references public.iris_conversas(id) on delete cascade,
  procedimento   text,
  data           date,
  hora_inicio    time,
  hora_fim       time,
  valor_centavos int,
  status         text        default 'ativa' check (status in ('ativa','paga','expirada','cancelada')),
  teste          boolean     default false,
  expira_em      timestamptz not null,
  pago_em        timestamptz,
  created_at     timestamptz default now()
);

-- 8. Índices
create index if not exists idx_iris_config_user      on public.iris_config(user_id);
create index if not exists idx_iris_manual_user      on public.iris_manual(user_id);
create index if not exists idx_iris_promocoes_user   on public.iris_promocoes(user_id);
create index if not exists idx_iris_conversas_user   on public.iris_conversas(user_id);
create index if not exists idx_iris_mensagens_user   on public.iris_mensagens(user_id);
create index if not exists idx_iris_mensagens_conv   on public.iris_mensagens(conversa_id, created_at);
create index if not exists idx_iris_pendencias_user  on public.iris_pendencias(user_id);
create index if not exists idx_iris_pendencias_conv  on public.iris_pendencias(conversa_id, created_at);
create index if not exists idx_iris_reservas_user    on public.iris_reservas(user_id);
create index if not exists idx_iris_reservas_conv    on public.iris_reservas(conversa_id, created_at);
create index if not exists idx_iris_reservas_data    on public.iris_reservas(user_id, data);

-- 9. Segurança: cada conta só vê e edita o que é seu
alter table public.iris_config enable row level security;
drop policy if exists "iris_config_select" on public.iris_config;
drop policy if exists "iris_config_insert" on public.iris_config;
drop policy if exists "iris_config_update" on public.iris_config;
drop policy if exists "iris_config_delete" on public.iris_config;
create policy "iris_config_select" on public.iris_config for select using (auth.uid() = user_id);
create policy "iris_config_insert" on public.iris_config for insert with check (auth.uid() = user_id);
create policy "iris_config_update" on public.iris_config for update using (auth.uid() = user_id);
create policy "iris_config_delete" on public.iris_config for delete using (auth.uid() = user_id);

alter table public.iris_manual enable row level security;
drop policy if exists "iris_manual_select" on public.iris_manual;
drop policy if exists "iris_manual_insert" on public.iris_manual;
drop policy if exists "iris_manual_update" on public.iris_manual;
drop policy if exists "iris_manual_delete" on public.iris_manual;
create policy "iris_manual_select" on public.iris_manual for select using (auth.uid() = user_id);
create policy "iris_manual_insert" on public.iris_manual for insert with check (auth.uid() = user_id);
create policy "iris_manual_update" on public.iris_manual for update using (auth.uid() = user_id);
create policy "iris_manual_delete" on public.iris_manual for delete using (auth.uid() = user_id);

alter table public.iris_promocoes enable row level security;
drop policy if exists "iris_promocoes_select" on public.iris_promocoes;
drop policy if exists "iris_promocoes_insert" on public.iris_promocoes;
drop policy if exists "iris_promocoes_update" on public.iris_promocoes;
drop policy if exists "iris_promocoes_delete" on public.iris_promocoes;
create policy "iris_promocoes_select" on public.iris_promocoes for select using (auth.uid() = user_id);
create policy "iris_promocoes_insert" on public.iris_promocoes for insert with check (auth.uid() = user_id);
create policy "iris_promocoes_update" on public.iris_promocoes for update using (auth.uid() = user_id);
create policy "iris_promocoes_delete" on public.iris_promocoes for delete using (auth.uid() = user_id);

alter table public.iris_conversas enable row level security;
drop policy if exists "iris_conversas_select" on public.iris_conversas;
drop policy if exists "iris_conversas_insert" on public.iris_conversas;
drop policy if exists "iris_conversas_update" on public.iris_conversas;
drop policy if exists "iris_conversas_delete" on public.iris_conversas;
create policy "iris_conversas_select" on public.iris_conversas for select using (auth.uid() = user_id);
create policy "iris_conversas_insert" on public.iris_conversas for insert with check (auth.uid() = user_id);
create policy "iris_conversas_update" on public.iris_conversas for update using (auth.uid() = user_id);
create policy "iris_conversas_delete" on public.iris_conversas for delete using (auth.uid() = user_id);

alter table public.iris_mensagens enable row level security;
drop policy if exists "iris_mensagens_select" on public.iris_mensagens;
drop policy if exists "iris_mensagens_insert" on public.iris_mensagens;
drop policy if exists "iris_mensagens_update" on public.iris_mensagens;
drop policy if exists "iris_mensagens_delete" on public.iris_mensagens;
create policy "iris_mensagens_select" on public.iris_mensagens for select using (auth.uid() = user_id);
create policy "iris_mensagens_insert" on public.iris_mensagens for insert with check (auth.uid() = user_id);
create policy "iris_mensagens_update" on public.iris_mensagens for update using (auth.uid() = user_id);
create policy "iris_mensagens_delete" on public.iris_mensagens for delete using (auth.uid() = user_id);

alter table public.iris_pendencias enable row level security;
drop policy if exists "iris_pendencias_select" on public.iris_pendencias;
drop policy if exists "iris_pendencias_insert" on public.iris_pendencias;
drop policy if exists "iris_pendencias_update" on public.iris_pendencias;
drop policy if exists "iris_pendencias_delete" on public.iris_pendencias;
create policy "iris_pendencias_select" on public.iris_pendencias for select using (auth.uid() = user_id);
create policy "iris_pendencias_insert" on public.iris_pendencias for insert with check (auth.uid() = user_id);
create policy "iris_pendencias_update" on public.iris_pendencias for update using (auth.uid() = user_id);
create policy "iris_pendencias_delete" on public.iris_pendencias for delete using (auth.uid() = user_id);

alter table public.iris_reservas enable row level security;
drop policy if exists "iris_reservas_select" on public.iris_reservas;
drop policy if exists "iris_reservas_insert" on public.iris_reservas;
drop policy if exists "iris_reservas_update" on public.iris_reservas;
drop policy if exists "iris_reservas_delete" on public.iris_reservas;
create policy "iris_reservas_select" on public.iris_reservas for select using (auth.uid() = user_id);
create policy "iris_reservas_insert" on public.iris_reservas for insert with check (auth.uid() = user_id);
create policy "iris_reservas_update" on public.iris_reservas for update using (auth.uid() = user_id);
create policy "iris_reservas_delete" on public.iris_reservas for delete using (auth.uid() = user_id);

-- 10. Segurar um horário de forma atômica
-- Cancela a reserva ativa anterior da conversa e tenta reservar [p_inicio, p_fim).
-- Devolve o id da reserva, ou null se a conversa não existe ou o horário está ocupado
-- (agendamento não cancelado, ou reserva paga / ativa não expirada).
-- Reservas de teste (simulador) só bloqueiam outras reservas de teste.
create or replace function public.iris_segurar_horario(
  p_conversa     uuid,
  p_procedimento text,
  p_data         date,
  p_inicio       time,
  p_fim          time,
  p_valor        int
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_user  uuid;
  v_canal text;
  v_teste boolean;
  v_id    uuid;
begin
  select c.user_id, c.canal into v_user, v_canal
    from public.iris_conversas c
   where c.id = p_conversa;
  if v_user is null then
    return null;
  end if;
  v_teste := (v_canal = 'simulador');

  -- uma trava por dono: duas conversas não reservam o mesmo horário ao mesmo tempo
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  -- (a) a reserva ativa anterior desta conversa é cancelada
  update public.iris_reservas
     set status = 'cancelada'
   where conversa_id = p_conversa
     and status = 'ativa';

  -- (b) conflito com agendamento existente
  if exists (
    select 1
      from public.agendamentos a
     where a.user_id = v_user
       and a.data = p_data
       and a.status <> 'cancelado'
       and a.hora_inicio < p_fim
       and coalesce(
             a.hora_fim,
             a.hora_inicio + case when a.procedimento ilike 'avalia%'
                                  then interval '30 minutes'
                                  else interval '60 minutes' end
           ) > p_inicio
  ) then
    return null;
  end if;

  -- (b) conflito com outra reserva (paga, ou ativa ainda não expirada)
  if exists (
    select 1
      from public.iris_reservas r
     where r.user_id = v_user
       and r.data = p_data
       and (r.status = 'paga' or (r.status = 'ativa' and r.expira_em > now()))
       and (not coalesce(r.teste, false) or v_teste)
       and r.hora_inicio < p_fim
       and r.hora_fim > p_inicio
  ) then
    return null;
  end if;

  -- (c) livre: reserva por 30 minutos
  insert into public.iris_reservas
    (user_id, conversa_id, procedimento, data, hora_inicio, hora_fim, valor_centavos, status, teste, expira_em)
  values
    (v_user, p_conversa, p_procedimento, p_data, p_inicio, p_fim, p_valor, 'ativa', v_teste, now() + interval '30 minutes')
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.iris_segurar_horario(uuid, text, date, time, time, int) to authenticated, service_role;
