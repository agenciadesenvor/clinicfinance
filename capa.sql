-- Foto da capa da tela inicial (visual Pinhal). Rodar uma vez no SQL Editor do Supabase.
alter table public.profiles add column if not exists capa_data text;
