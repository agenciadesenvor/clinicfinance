// POST /functions/v1/iris-chat — um turno da Íris no simulador.
import { createClient } from "@supabase/supabase-js";
import { atender } from "../_shared/atendimento.ts";
import { clienteAnthropic } from "../_shared/cerebro.ts";
import { cors, json, usuario } from "../_shared/http.ts";
import { repoSupabase } from "../_shared/repo.ts";

const MAX_TEXTO = 4000;

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ erro: "metodo_nao_permitido" }, 405, h);
  try {
    const uid = await usuario(req);
    if (!uid) return json({ erro: "nao_autenticado" }, 401, h);

    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return json({ erro: "json_invalido" }, 400, h);
    }
    const { conversa_id, texto } = (corpo ?? {}) as Record<string, unknown>;
    if (typeof conversa_id !== "string" || !conversa_id) return json({ erro: "conversa_id_invalido" }, 400, h);
    if (texto !== undefined && (typeof texto !== "string" || !texto.trim() || texto.length > MAX_TEXTO)) {
      return json({ erro: "texto_invalido" }, 400, h);
    }

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: conversa, error } = await db.from("iris_conversas").select("user_id, canal").eq("id", conversa_id)
      .maybeSingle();
    if (error) throw new Error(`conversa: ${error.message}`);
    if (!conversa || conversa.user_id !== uid) return json({ erro: "nao_encontrada" }, 404, h);
    if (conversa.canal !== "simulador") return json({ erro: "canal_nao_suportado" }, 400, h);

    const desfecho = await atender({
      repo: repoSupabase(db), cliente: clienteAnthropic(), conversaId: conversa_id, agora: new Date(),
      texto: texto as string | undefined,
    });
    return json({ desfecho }, 200, h);
  } catch (e) {
    console.error("iris-chat falhou:", e);
    return json({ erro: "interno" }, 500, h);
  }
});
