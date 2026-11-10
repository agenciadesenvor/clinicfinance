// Teste de fumaça real da função iris-chat (usa a API do Claude de verdade).
// cd supabase/functions && npx -y deno run -A --env-file=../../.env.test _evals/fumaca.ts [--manter]
import { createClient } from "@supabase/supabase-js";

const VARS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "TESTE_EMAIL", "TESTE_SENHA"] as const;
const faltando = VARS.filter((v) => !Deno.env.get(v));
if (faltando.length) {
  console.error(`Faltam variáveis de ambiente: ${faltando.join(", ")}. Confira o .env.test.`);
  Deno.exit(1);
}
const env = (v: (typeof VARS)[number]) => Deno.env.get(v)!;
const manter = Deno.args.includes("--manter");

function checar<T>(r: { data: T; error: { message: string } | null }, onde: string): T {
  if (r.error) {
    console.error(`Falha em ${onde}: ${r.error.message}`);
    Deno.exit(1);
  }
  return r.data;
}

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
const login = await db.auth.signInWithPassword({ email: env("TESTE_EMAIL"), password: env("TESTE_SENHA") });
if (login.error || !login.data.session) {
  console.error(`Não foi possível entrar com a conta de teste: ${login.error?.message ?? "sem sessão"}`);
  Deno.exit(1);
}
const uid = login.data.user.id;
const token = login.data.session.access_token;

checar(await db.from("iris_config").upsert({ user_id: uid, modo: "automatico" }, { onConflict: "user_id" }), "iris_config");
checar(
  await db.from("iris_manual").upsert([
    {
      user_id: uid, chave: "avaliacao", nome: "Avaliação", informa_preco: true, preco_texto: "R$ 100",
      duracao_min: 30, agenda_direto: true, sinal_centavos: 10000,
    },
    {
      user_id: uid, chave: "limpeza_de_pele", nome: "Limpeza de pele", informa_preco: true, preco_texto: "R$ 130",
      duracao_min: 60, agenda_direto: true, sinal_centavos: 6500,
    },
    {
      user_id: uid, chave: "botox", nome: "Botox", informa_preco: true,
      preco_texto: "A partir de R$ 1.000, depende das áreas", agenda_direto: false,
    },
  ], { onConflict: "user_id,chave" }),
  "iris_manual",
);
const conversa: { id: string } = checar(
  await db.from("iris_conversas").insert({ user_id: uid, canal: "simulador", contato_nome: "Camila (teste de fumaça)" })
    .select("id").single(),
  "iris_conversas",
)!;

const falhas: string[] = [];
try {
  const resp = await fetch(`${env("SUPABASE_URL")}/functions/v1/iris-chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: env("SUPABASE_ANON_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ conversa_id: conversa.id, texto: "oi, quanto custa a avaliação?" }),
  });
  const corpo = await resp.json().catch(() => ({}));
  console.log(`HTTP ${resp.status} — desfecho: ${corpo.desfecho ?? JSON.stringify(corpo)}`);
  if (corpo.desfecho !== "respondida") falhas.push(`desfecho esperado "respondida", veio ${JSON.stringify(corpo.desfecho)}`);

  const msgs = checar(
    await db.from("iris_mensagens").select("autor, status, texto, meta").eq("conversa_id", conversa.id)
      .order("created_at", { ascending: true }),
    "iris_mensagens",
  ) ?? [];
  console.log("\nMensagens:");
  for (const m of msgs) console.log(`- [${m.autor}/${m.status}] ${m.texto}`);
  const uso = msgs.find((m) => m.meta?.uso)?.meta?.uso;
  console.log(`\nmeta.uso: ${JSON.stringify(uso ?? null)}`);
  console.log(`cache_lido: ${uso?.cache_lido ?? 0}`);

  const daIris = msgs.filter((m) => m.autor === "iris").map((m) => m.texto as string);
  if (!daIris.some((t) => t.includes("R$ 100"))) falhas.push('nenhuma mensagem da Íris cita "R$ 100"');
  if (!daIris.some((t) => t.includes("Íris"))) falhas.push("a Íris não se apresentou");
  if (daIris.some((t) => t.toLowerCase().includes("assistente virtual"))) falhas.push('apareceu "assistente virtual"');
} finally {
  if (!manter) await db.from("iris_conversas").delete().eq("id", conversa.id);
  else console.log(`\nConversa mantida: ${conversa.id}`);
  await db.auth.signOut();
}

if (falhas.length) {
  console.error(`\nFalhou:\n${falhas.map((f) => `- ${f}`).join("\n")}`);
  Deno.exit(1);
}
console.log("\nOK: todas as conferências passaram.");
