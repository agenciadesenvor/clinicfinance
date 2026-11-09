-- =====================================================
-- CLINICFINANCE — ÍRIS — teste da função iris_segurar_horario
-- Execute DEPOIS de iris.sql: Supabase Dashboard → SQL Editor → New Query → Run
-- Seguro de rodar: cria duas conversas de teste e apaga tudo ao final
-- (as reservas somem junto, por cascade). Não deixa nenhuma linha para trás.
-- Esperado: "Success. No rows returned" (e a mensagem "iris-teste: tudo certo").
-- =====================================================
do $$
declare
  v_user  uuid;
  v_a     uuid;
  v_b     uuid;
  v_data  date := current_date + 400;
  v_r1    uuid;
  v_r2    uuid;
  v_r3    uuid;
  v_r4    uuid;
  v_status text;
begin
  select id into v_user from auth.users limit 1;
  if v_user is null then
    raise exception 'iris-teste: nenhum usuário em auth.users para usar no teste';
  end if;

  insert into public.iris_conversas (user_id, canal, contato_nome)
    values (v_user, 'simulador', 'teste A') returning id into v_a;
  insert into public.iris_conversas (user_id, canal, contato_nome)
    values (v_user, 'simulador', 'teste B') returning id into v_b;

  begin
    -- 1. conversa A segura 10:00-10:30
    v_r1 := public.iris_segurar_horario(v_a, 'Teste', v_data, '10:00', '10:30', 1000);
    if v_r1 is null then
      raise exception 'iris-teste: a conversa A deveria conseguir segurar 10:00-10:30, mas recebeu null';
    end if;

    -- 2. conversa B tenta 10:00-11:00 (cruza com A) -> null
    v_r2 := public.iris_segurar_horario(v_b, 'Teste', v_data, '10:00', '11:00', 1000);
    if v_r2 is not null then
      raise exception 'iris-teste: a conversa B não deveria segurar 10:00-11:00 (cruza com a reserva de A)';
    end if;

    -- 3. conversa B tenta 10:30-11:00 (colado, sem cruzar) -> uuid
    v_r3 := public.iris_segurar_horario(v_b, 'Teste', v_data, '10:30', '11:00', 1000);
    if v_r3 is null then
      raise exception 'iris-teste: a conversa B deveria segurar 10:30-11:00 (horário colado, sem cruzar), mas recebeu null';
    end if;

    -- 4. conversa A segura outro horário -> a reserva anterior de A vira cancelada
    v_r4 := public.iris_segurar_horario(v_a, 'Teste', v_data, '14:00', '14:30', 1000);
    if v_r4 is null then
      raise exception 'iris-teste: a conversa A deveria conseguir segurar 14:00-14:30, mas recebeu null';
    end if;
    select status into v_status from public.iris_reservas where id = v_r1;
    if v_status is distinct from 'cancelada' then
      raise exception 'iris-teste: a reserva anterior de A deveria estar cancelada, mas está: %', coalesce(v_status, 'inexistente');
    end if;
  exception when others then
    -- limpa antes de repassar o erro
    delete from public.iris_conversas where id in (v_a, v_b);
    raise;
  end;

  -- limpeza: apagar as conversas leva as reservas junto (cascade)
  delete from public.iris_conversas where id in (v_a, v_b);

  raise notice 'iris-teste: tudo certo';
end;
$$;
