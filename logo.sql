-- =====================================================
-- CLINICFINANCE — Logo da empresa (perfil)
-- Execute em: Supabase Dashboard → SQL Editor → New Query
-- =====================================================

alter table public.profiles
  add column if not exists logo_data text default '';
