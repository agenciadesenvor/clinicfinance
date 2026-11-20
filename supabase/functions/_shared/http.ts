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

// Valida o JWT do Authorization e devolve o id e o e-mail (minúsculo, "" se não houver), ou null.
export async function usuario(req: Request): Promise<{ id: string; email: string } | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return null;
  const { data, error } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: (data.user.email ?? "").trim().toLowerCase() };
}

// O cadastro é aberto, então a Íris (que gasta créditos de IA) só atende os e-mails de IRIS_EMAILS,
// separados por vírgula. Sem lista configurada, ninguém entra.
export function temAcesso(email: string, lista: string | undefined): boolean {
  const alvo = email.trim().toLowerCase();
  if (!alvo || !lista) return false;
  return lista.split(",").map((e) => e.trim().toLowerCase()).filter((e) => e !== "").includes(alvo);
}

export function json(corpo: unknown, status: number, headers: Headers): Response {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(corpo), { status, headers: h });
}
