// POST /functions/v1/iris-pagamento — confirma o pagamento simulado de uma reserva.
import { createClient } from "@supabase/supabase-js";
import { efeitosSimulados } from "../_shared/ferramentas.ts";
import { cors, json, usuario } from "../_shared/http.ts";
import { repoSupabase } from "../_shared/repo.ts";
import { confirmarReserva } from "../_shared/reservas.ts";

const MAX_CORPO = 20_000; // bytes
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ erro: "metodo_nao_permitido" }, 405, h);
  try {
    const uid = await usuario(req);
    if (!uid) return json({ erro: "nao_autenticado" }, 401, h);

    if (Number(req.headers.get("content-length") ?? 0) > MAX_CORPO) return json({ erro: "corpo_grande" }, 400, h);
    const bruto = await req.text();
    if (new TextEncoder().encode(bruto).length > MAX_CORPO) return json({ erro: "corpo_grande" }, 400, h);
    let corpo: unknown;
    try {
      corpo = JSON.parse(bruto);
    } catch {
      return json({ erro: "json_invalido" }, 400, h);
    }
    const { reserva_id, simulado } = (corpo ?? {}) as Record<string, unknown>;
    if (typeof reserva_id !== "string" || !UUID.test(reserva_id)) return json({ erro: "reserva_id_invalido" }, 400, h);
    if (simulado !== true) return json({ erro: "pagamento_real_nao_suportado" }, 400, h);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const repo = repoSupabase(db);
    const reserva = await repo.reserva(reserva_id);
    const carregado = reserva ? await repo.carregar(reserva.conversa_id) : null;
    if (!reserva || !carregado || carregado.conversa.user_id !== uid) return json({ erro: "nao_encontrada" }, 404, h);
    const { conversa, config } = carregado;
    if (conversa.canal !== "simulador") return json({ erro: "canal_nao_suportado" }, 403, h);

    // Sem nome conhecido a frase sai sem vocativo.
    const qual = conversa.qualificacao?.nome;
    const nome = typeof qual === "string" && qual.trim() ? qual.trim() : (conversa.contato_nome ?? "").trim().split(/\s+/)[0];

    const resultado = await confirmarReserva({
      repo, efeitos: efeitosSimulados(repo, conversa.id), reservaId: reserva_id, agora: new Date(), config, nome,
    });
    return json({ resultado }, 200, h);
  } catch (e) {
    console.error("iris-pagamento falhou:", e);
    return json({ erro: "interno" }, 500, h);
  }
});
