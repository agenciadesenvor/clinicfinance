-- Tratamento usado na saudação da tela inicial ("Boa tarde, Dra. Patrícia").
-- Valores: 'Dra.', 'Dr.' ou vazio (sem título). Rodar uma vez no SQL Editor do Supabase.
alter table public.profiles add column if not exists tratamento text;
