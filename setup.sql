-- =====================================================
-- CLINICFINANCE — SQL DE CONFIGURAÇÃO (Supabase)
-- Execute em: Supabase Dashboard → SQL Editor → New Query
-- =====================================================

-- 1. Tabela de perfis dos usuários
create table if not exists public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  email        text,
  cpf          text,
  first_name   text,
  last_name    text,
  specialty    text        default '',
  avatar_data  text        default '',   -- foto em base64
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- 2. Row Level Security (cada usuário vê/edita só o próprio perfil)
alter table public.profiles enable row level security;

create policy "Leitura própria"     on public.profiles for select using (auth.uid() = id);
create policy "Inserção própria"    on public.profiles for insert with check (auth.uid() = id);
create policy "Atualização própria" on public.profiles for update using (auth.uid() = id);

-- 3. Trigger: cria perfil automaticamente ao confirmar email
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, first_name, last_name, cpf)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name',  ''),
    coalesce(new.raw_user_meta_data->>'cpf',        '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- CONFIGURAÇÕES SUPABASE (fazer no Dashboard)
-- =====================================================
-- Authentication → Email → Confirm email: ATIVADO
-- Authentication → Email → Redirect URL: https://SEU_DOMINIO/auth.html
-- Authentication → SMTP → Configure Resend como provedor
-- Site URL: https://SEU_DOMINIO
-- =====================================================
