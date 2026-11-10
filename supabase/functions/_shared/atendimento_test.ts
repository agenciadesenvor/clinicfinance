import { assert, assertEquals, assertRejects } from "@std/assert";
import { criarRepoFake, type RepoFake } from "./repo_fake.ts";
import type { ClienteClaude } from "./cerebro.ts";
import { atender, type Desfecho, pendentes } from "./atendimento.ts";
import type { IrisConfig, ItemManual, Mensagem } from "./tipos.ts";

// deno-lint-ignore no-explicit-any
type Resp = any;
type Falso = ClienteClaude & { chamadas: Record<string, unknown>[] };

const QUI_14H = new Date("2026-11-12T17:00:00Z"); // quinta 14:00 em Recife
const QUI_22H30 = new Date("2026-11-13T01:30:00Z"); // quinta 22:30 em Recife
const HORA = 3600_000;

const USO = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 0 };
const fim = (texto: string): Resp => ({ stop_reason: "end_turn", content: [{ type: "text", text: texto }], usage: USO });

const AVALIACAO: ItemManual = {
  chave: "avaliacao", nome: "Avaliação", o_que_e: "", indicacao: "", preparo: "", cuidados: "",
  informa_preco: true, preco_texto: "R$ 100", duracao_min: 30, agenda_direto: true, sinal_centavos: 10000, aprovado: true,
};

// Cliente falso: devolve as respostas da fila; `aoChamar` roda antes de responder (n = nº da chamada).
function cliente(respostas: Resp[], aoChamar?: (n: number) => Promise<void> | void): Falso {
  const fila = [...respostas];
  const chamadas: Record<string, unknown>[] = [];
  return {
    chamadas,
    async criar(params) {
      chamadas.push(structuredClone(params));
      await aoChamar?.(chamadas.length);
      const r = fila.shift();
      if (!r) throw new Error("fila vazia");
      return r;
    },
  };
}

function montar(agora: Date, config: Partial<IrisConfig> = {}, conversa = {}) {
  return criarRepoFake({ agora, manual: [AVALIACAO], config, conversa });
}
const rodar = (fake: RepoFake, c: ClienteClaude, agora: Date, texto?: string): Promise<Desfecho> =>
  atender({ repo: fake, cliente: c, conversaId: fake.conversa.id, agora, texto });
const daIris = (fake: RepoFake) => fake.mensagens.filter((m) => m.autor === "iris");
const notas = (fake: RepoFake) => fake.mensagens.filter((m) => m.autor === "sistema").map((m) => m.texto);
// deno-lint-ignore no-explicit-any
const cobre = (m: { meta?: unknown }) => (m.meta as any)?.cobre_ate;
const pendentesDe = (fake: RepoFake) => pendentes(fake.mensagens).map((m) => m.texto);
// deno-lint-ignore no-explicit-any
const ultimaUser = (c: Falso, i: number) => (c.chamadas[i].messages as any[]).at(-1).content as string;

async function semConsole<T>(f: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = original;
  }
}

Deno.test("supervisionado em horário comercial gera rascunho", async () => {
  const fake = montar(QUI_14H);
  const c = cliente([fim("Olá, Camila! Aqui é a Íris.\n\nA avaliação custa R$ 100.")]);
  assertEquals(await rodar(fake, c, QUI_14H, "quanto custa a avaliação?"), "rascunho");
  assertEquals(c.chamadas.length, 1);
  assertEquals(daIris(fake).map((m) => [m.status, m.fora_expediente]), [["rascunho", false], ["rascunho", false]]);
  assertEquals(fake.mensagens[0].autor, "paciente");
  assertEquals(fake.mensagens[0].status, "enviada");
});

Deno.test("supervisionado fora do expediente envia e marca fora_expediente", async () => {
  const fake = montar(QUI_22H30);
  const c = cliente([fim("Olá, Camila! A avaliação custa R$ 100.")]);
  assertEquals(await rodar(fake, c, QUI_22H30, "quanto custa a avaliação?"), "respondida");
  assertEquals(c.chamadas.length, 1);
  assertEquals(daIris(fake).map((m) => [m.status, m.fora_expediente]), [["enviada", true]]);
});

Deno.test("automático envia direto", async () => {
  const fake = montar(QUI_14H, { modo: "automatico" });
  const c = cliente([fim("Olá, Camila!")]);
  assertEquals(await rodar(fake, c, QUI_14H, "oi"), "respondida");
  assertEquals(c.chamadas.length, 1);
  assertEquals(daIris(fake).map((m) => [m.texto, m.status, m.fora_expediente]), [["Olá, Camila!", "enviada", false]]);
});

Deno.test("conversa com a equipe não gera resposta; depois de 12h a Íris volta", async () => {
  const ha2h = montar(QUI_14H, {}, { estado: "equipe", equipe_desde: new Date(QUI_14H.getTime() - 2 * HORA).toISOString() });
  const c1 = cliente([fim("não deveria sair")]);
  assertEquals(await rodar(ha2h, c1, QUI_14H, "oi?"), "equipe");
  assertEquals(c1.chamadas.length, 0);
  assertEquals(daIris(ha2h).length, 0);
  assertEquals(ha2h.mensagens.map((m) => m.autor), ["paciente"]);
  assertEquals(ha2h.conversa.estado, "equipe");

  const ha13h = montar(QUI_14H, {}, { estado: "equipe", equipe_desde: new Date(QUI_14H.getTime() - 13 * HORA).toISOString() });
  const c2 = cliente([fim("Olá de novo, Camila!")]);
  assertEquals(await rodar(ha13h, c2, QUI_14H, "oi?"), "rascunho");
  assertEquals(c2.chamadas.length, 1);
  assertEquals([ha13h.conversa.estado, ha13h.conversa.equipe_desde], ["iris", null]);
  assertEquals(daIris(ha13h).length, 1);
});

Deno.test("limite de 12h: 11h59 fica com a equipe, 12h01 a Íris responde", async () => {
  const desde = (min: number) => new Date(QUI_22H30.getTime() - min * 60_000).toISOString();
  const quase = montar(QUI_22H30, {}, { estado: "equipe", equipe_desde: desde(11 * 60 + 59) });
  const c1 = cliente([fim("não deveria sair")]);
  assertEquals(await rodar(quase, c1, QUI_22H30, "alguém?"), "equipe");
  assertEquals([c1.chamadas.length, quase.conversa.estado], [0, "equipe"]);

  const passou = montar(QUI_22H30, {}, { estado: "equipe", equipe_desde: desde(12 * 60 + 1) });
  const c2 = cliente([fim("Oi, Camila, estou aqui.")]);
  assertEquals(await rodar(passou, c2, QUI_22H30, "alguém?"), "respondida");
  assertEquals([c2.chamadas.length, passou.conversa.estado], [1, "iris"]);
  assertEquals(daIris(passou).map((m) => m.status), ["enviada"]);
});

Deno.test("rajada: segunda mensagem durante o processamento fica enfileirada e a resposta considera as duas", async () => {
  const fake = montar(QUI_22H30);
  let segunda: Desfecho | null = null;
  const c = cliente([fim("resposta à primeira"), fim("Oi, Camila! A avaliação custa R$ 100.")], async (n) => {
    // A paciente manda outra mensagem enquanto a primeira está sendo respondida.
    if (n === 1) segunda = await rodar(fake, c, QUI_22H30, "quanto custa a avaliação?");
  });
  assertEquals(await rodar(fake, c, QUI_22H30, "oi"), "respondida");
  assertEquals(segunda, "enfileirada");
  assertEquals(c.chamadas.length, 2);
  assertEquals(ultimaUser(c, 1), "oi\n\nquanto custa a avaliação?");
  assertEquals(daIris(fake).map((m) => m.texto), ["Oi, Camila! A avaliação custa R$ 100."]);
  assertEquals(fake.mensagens.map((m) => m.autor), ["paciente", "paciente", "iris"]);
});

Deno.test("rajada de 4 mensagens: a 3ª chamada grava com marcador e a 4ª mensagem é respondida depois", async () => {
  const fake = montar(QUI_22H30);
  const c = cliente([fim("r1"), fim("r2"), fim("r3"), fim("r4")], async (n) => {
    if (n <= 3) await fake.salvarMensagem(fake.conversa.id, { autor: "paciente", texto: `extra ${n}`, status: "enviada" });
  });
  assertEquals(await rodar(fake, c, QUI_22H30, "oi"), "respondida");
  // 1ª e 2ª descartadas pela rajada; a 3ª é gravada cobrindo até "extra 2"; "extra 3" leva à 4ª.
  assertEquals(c.chamadas.length, 4);
  assertEquals(ultimaUser(c, 2), "oi\n\nextra 1\n\nextra 2");
  // deno-lint-ignore no-explicit-any
  assertEquals((c.chamadas[3].messages as any[]).map((m) => m.role), ["user", "assistant", "user"]);
  assertEquals(ultimaUser(c, 3), "extra 3"); // o histórico termina na paciente, nunca na Íris
  const id = (t: string) => fake.mensagens.find((m) => m.texto === t)!.id;
  assertEquals(daIris(fake).map((m) => [m.texto, cobre(m)]), [["r3", id("extra 2")], ["r4", id("extra 3")]]);
  assertEquals(pendentesDe(fake), []);
});

Deno.test("nova mensagem descarta o rascunho anterior", async () => {
  const fake = montar(QUI_14H);
  const c = cliente([fim("primeiro rascunho"), fim("segundo rascunho")]);
  assertEquals(await rodar(fake, c, QUI_14H, "oi"), "rascunho");
  assertEquals(await rodar(fake, c, QUI_14H, "tem horário amanhã?"), "rascunho");
  assertEquals(c.chamadas.length, 2);
  assertEquals(daIris(fake).map((m) => [m.texto, m.status]), [
    ["primeiro rascunho", "descartada"],
    ["segundo rascunho", "rascunho"],
  ]);
});

Deno.test("falha da IA: nenhuma mensagem da Íris, nota de sistema, trava liberada", async () => {
  const fake = montar(QUI_22H30);
  const falha: Falso = { chamadas: [], criar: () => Promise.reject(new Error("api fora do ar")) };
  assertEquals(await semConsole(() => rodar(fake, falha, QUI_22H30, "oi")), "bloqueada");
  assertEquals(daIris(fake).length, 0);
  assertEquals(notas(fake), [
    "A Íris não conseguiu responder (falha técnica). Responda você ou peça para ela tentar de novo.",
  ]);
  assertEquals(fake.mensagens.map(cobre).filter(Boolean), []); // bloqueio não grava marcador
  assertEquals(pendentesDe(fake), ["oi"]);
  // A próxima chamada, mesmo sem texto, trava de novo e chama o modelo.
  const c = cliente([fim("Oi, Camila!")]);
  assertEquals(await rodar(fake, c, QUI_22H30), "respondida");
  assertEquals(c.chamadas.length, 1);
  assertEquals(daIris(fake).map((m) => m.texto), ["Oi, Camila!"]);
  assertEquals(pendentesDe(fake), []);
});

Deno.test("recusa: só a nota de sistema", async () => {
  const fake = montar(QUI_22H30);
  const c = cliente([{ stop_reason: "refusal", content: [], usage: USO }]);
  assertEquals(await rodar(fake, c, QUI_22H30, "oi"), "bloqueada");
  assertEquals(daIris(fake).length, 0);
  assertEquals(notas(fake), ["A Íris não conseguiu concluir esta resposta. Responda você."]);
});

Deno.test("valor não autorizado vira rascunho mesmo no modo automático", async () => {
  const fake = montar(QUI_22H30, { modo: "automatico" });
  const c = cliente([fim("A avaliação custa R$ 250.")]);
  assertEquals(await rodar(fake, c, QUI_22H30, "quanto custa?"), "rascunho");
  assertEquals(c.chamadas.length, 1);
  assertEquals(daIris(fake).map((m) => [m.texto, m.status]), [["A avaliação custa R$ 250.", "rascunho"]]);
  assertEquals(notas(fake), ["A Íris citou um valor que não está no Manual. Confira antes de enviar."]);
});

Deno.test("nada pendente: respondida sem chamar o modelo", async () => {
  const fake = montar(QUI_22H30);
  const c = cliente([fim("não deveria sair")]);
  assertEquals(await rodar(fake, c, QUI_22H30), "respondida");
  await fake.salvarMensagem(fake.conversa.id, { autor: "paciente", texto: "oi", status: "enviada" });
  await fake.salvarMensagem(fake.conversa.id, { autor: "iris", texto: "Oi!", status: "enviada", meta: { cobre_ate: "msg-1" } });
  assertEquals(await rodar(fake, c, QUI_22H30), "respondida");
  await fake.salvarMensagem(fake.conversa.id, { autor: "paciente", texto: "obrigada", status: "enviada" });
  await fake.salvarMensagem(fake.conversa.id, { autor: "equipe", texto: "Por nada!", status: "enviada" });
  assertEquals(await rodar(fake, c, QUI_22H30), "respondida");
  assertEquals(c.chamadas.length, 0);
  assertEquals(fake.mensagens.length, 4);
});

Deno.test("sem a trava: enfileirada, mensagem gravada, nenhuma chamada", async () => {
  const fake = montar(QUI_22H30);
  assert(await fake.travar(fake.conversa.id, 120));
  const c = cliente([fim("não deveria sair")]);
  assertEquals(await rodar(fake, c, QUI_22H30, "oi"), "enfileirada");
  assertEquals(c.chamadas.length, 0);
  assertEquals(fake.mensagens.map((m) => [m.autor, m.texto, m.status]), [["paciente", "oi", "enviada"]]);
});

Deno.test("trava liberada quando o repo falha no meio do turno", async () => {
  const fake = montar(QUI_22H30);
  fake.salvarMensagens = () => Promise.reject(new Error("banco fora"));
  const c = cliente([fim("Oi!\n\nTudo bem?")]);
  await assertRejects(() => rodar(fake, c, QUI_22H30, "oi"), Error, "banco fora");
  assertEquals(c.chamadas.length, 1);
  assertEquals(daIris(fake).length, 0);
  assertEquals(pendentesDe(fake), ["oi"]);
  assert(await fake.travar(fake.conversa.id, 120), "a trava deveria estar livre");
});

Deno.test("meta.uso vai na primeira mensagem do turno", async () => {
  const fake = montar(QUI_22H30);
  const c = cliente([fim("Oi, Camila!\n\nComo posso ajudar?")]);
  await rodar(fake, c, QUI_22H30, "oi");
  const [a, b] = daIris(fake);
  assertEquals(a.meta, { uso: { entrada: 10, saida: 5, cache_lido: 7, cache_escrito: 0 }, cobre_ate: "msg-1" });
  assertEquals(b.meta, {});
  assertEquals(fake.mensagens[0].meta, {});

  const bloqueada = montar(QUI_22H30);
  await rodar(bloqueada, cliente([{ stop_reason: "refusal", content: [], usage: USO }]), QUI_22H30, "oi");
  assertEquals(bloqueada.mensagens.at(-1)!.meta, { uso: { entrada: 10, saida: 5, cache_lido: 7, cache_escrito: 0 } });
});

Deno.test("reconferência após destravar responde mensagem que chegou durante a gravação", async () => {
  const fake = montar(QUI_22H30);
  const original = fake.salvarMensagens;
  let inserida = false;
  fake.salvarMensagens = async (id, ms) => {
    const r = await original(id, ms);
    if (!inserida) {
      inserida = true;
      await fake.salvarMensagem(id, { autor: "paciente", texto: "e tem horário amanhã?", status: "enviada" });
    }
    return r;
  };
  const c = cliente([fim("A avaliação custa R$ 100."), fim("Tenho sexta às 9h ou às 9h30.")]);
  assertEquals(await rodar(fake, c, QUI_22H30, "quanto custa?"), "respondida");
  assertEquals(c.chamadas.length, 2);
  assert(ultimaUser(c, 1).includes("e tem horário amanhã?"));
  assertEquals(fake.mensagens.map((m) => m.autor), ["paciente", "iris", "paciente", "iris"]);
  assertEquals(daIris(fake).map(cobre), ["msg-1", "msg-3"]);
  assertEquals(pendentesDe(fake), []);
  assert(await fake.travar(fake.conversa.id, 120));
});

Deno.test("mensagem gravada entre a conferência de rajada e a gravação é respondida", async () => {
  const fake = montar(QUI_22H30);
  const original = fake.salvarMensagens;
  let inserida = false;
  fake.salvarMensagens = async (id, ms) => {
    if (!inserida) {
      inserida = true;
      await fake.salvarMensagem(id, { autor: "paciente", texto: "chegou agora", status: "enviada" });
    }
    return await original(id, ms);
  };
  const c = cliente([fim("Oi!\n\nComo posso ajudar?"), fim("Sobre o que chegou agora: posso ajudar.")]);
  assertEquals(await rodar(fake, c, QUI_22H30, "oi"), "respondida");
  assertEquals(c.chamadas.length, 2);
  // A primeira resposta cobre só "oi"; "chegou agora" fica pendente e a 2ª execução responde.
  assertEquals(daIris(fake).map(cobre), ["msg-1", undefined, "msg-2"]);
  assertEquals(pendentesDe(fake), []);
});

Deno.test("reconferência após destravar é limitada", async () => {
  const fake = montar(QUI_22H30);
  const original = fake.salvarMensagens;
  let n = 0;
  fake.salvarMensagens = async (id, ms) => {
    const r = await original(id, ms);
    await fake.salvarMensagem(id, { autor: "paciente", texto: `mais uma ${++n}`, status: "enviada" });
    return r;
  };
  const c = cliente(Array.from({ length: 10 }, (_, i) => fim(`r${i + 1}`)));
  assertEquals(await rodar(fake, c, QUI_22H30, "oi"), "respondida");
  assertEquals(c.chamadas.length, 6); // execução inicial + 5 extras
  assertEquals(pendentesDe(fake), ["mais uma 6"]);
  assert(await fake.travar(fake.conversa.id, 180), "a trava deveria estar livre");
});

Deno.test("trava vencida durante o modelo: quem perdeu não grava nem solta a trava do outro", async () => {
  const fake = montar(QUI_22H30);
  let liberar!: () => void;
  const segura = new Promise<void>((r) => (liberar = r));
  let segundaNoModelo!: () => void;
  const entrou = new Promise<void>((r) => (segundaNoModelo = r));
  let segunda: Promise<Desfecho> | null = null;
  const c = cliente([fim("resposta da primeira"), fim("resposta da segunda")], async (n) => {
    if (n === 1) {
      fake.agora = new Date(QUI_22H30.getTime() + 181_000); // a trava de 180 s venceu
      segunda = rodar(fake, c, fake.agora, "ainda aí?");
      await entrou; // a segunda já tem a trava e está no modelo
    }
    if (n === 2) {
      segundaNoModelo();
      await segura;
    }
  });
  assertEquals(await rodar(fake, c, QUI_22H30, "oi"), "enfileirada");
  assertEquals(daIris(fake).length, 0);
  assertEquals(await fake.travar(fake.conversa.id, 180), null, "a trava da segunda execução foi solta");
  liberar();
  assertEquals(await segunda!, "respondida");
  assertEquals(c.chamadas.length, 2);
  assertEquals(daIris(fake).map((m) => [m.texto, cobre(m)]), [["resposta da segunda", "msg-2"]]);
  assertEquals(pendentesDe(fake), []);
});

// pendentes: regra de cobertura
const msg = (id: string, autor: Mensagem["autor"], status: Mensagem["status"] = "enviada", meta: unknown = {}): Mensagem =>
  ({ id, autor, texto: id, status, created_at: "", meta });
const ids = (ms: Mensagem[]) => pendentes(ms).map((m) => m.id);

Deno.test("pendentes: o que vem depois do marcador", () => {
  assertEquals(ids([msg("p1", "paciente"), msg("p2", "paciente"), msg("i1", "iris", "enviada", { cobre_ate: "p1" })]), ["p2"]);
  assertEquals(ids([msg("p1", "paciente"), msg("i1", "iris", "enviada", { cobre_ate: "p1" }), msg("p2", "paciente")]), ["p2"]);
});
Deno.test("pendentes: mensagem da equipe cobre tudo antes dela", () => {
  assertEquals(ids([msg("p1", "paciente"), msg("e1", "equipe"), msg("p2", "paciente")]), ["p2"]);
  assertEquals(ids([msg("p1", "paciente"), msg("e1", "equipe", "rascunho")]), ["p1"]);
});
Deno.test("pendentes: rascunho e descartada não cobrem", () => {
  assertEquals(ids([msg("p1", "paciente"), msg("i1", "iris", "rascunho", { cobre_ate: "p1" })]), ["p1"]);
  assertEquals(ids([msg("p1", "paciente"), msg("i1", "iris", "descartada", { cobre_ate: "p1" })]), ["p1"]);
});
Deno.test("pendentes: marcador com id desconhecido cobre até a própria mensagem", () => {
  assertEquals(ids([msg("p1", "paciente"), msg("i1", "iris", "enviada", { cobre_ate: "sumiu" }), msg("p2", "paciente")]), ["p2"]);
});
Deno.test("pendentes: nada pendente", () => {
  assertEquals(ids([]), []);
  assertEquals(ids([msg("s1", "sistema"), msg("i1", "iris", "enviada", { cobre_ate: "x" })]), []);
  assertEquals(ids([msg("p1", "paciente", "descartada")]), []);
});

Deno.test("canal que não é o simulador: erro antes de gravar qualquer coisa", async () => {
  const fake = montar(QUI_22H30, {}, { canal: "whatsapp" });
  const c = cliente([fim("não deveria sair")]);
  await assertRejects(() => rodar(fake, c, QUI_22H30, "oi"), Error, "canal não suportado nesta fase");
  assertEquals([fake.mensagens.length, c.chamadas.length], [0, 0]);
});
