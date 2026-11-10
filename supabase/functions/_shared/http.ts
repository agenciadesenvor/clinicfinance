// Ajudantes HTTP das Edge Functions: CORS, usuário do JWT e resposta JSON.
import { createClient } from "@supabase/supabase-js";

const ORIGENS = new Set(["https://clinicfinance.vercel.app", "http://localhost:3456"]);

export function cors(req: Request): Headers {
  const h = new Headers({
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  });
  const origem = req.headers.get("origin");
  if (origem && ORIGENS.has(origem)) h.set("Access-Control-Allow-Origin", origem);
  return h;
}

// Valida o JWT do Authorization e devolve o user_id (ou null).
export async function usuario(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

export function json(corpo: unknown, status: number, headers: Headers): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(corpo), { status, headers: h });
}
