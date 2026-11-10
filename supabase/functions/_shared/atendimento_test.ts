import { assert, assertEquals, assertRejects } from "@std/assert";
import { criarRepoFake, type RepoFake } from "./repo_fake.ts";
import type { ClienteClaude } from "./cerebro.ts";
import { atender, type Desfecho } from "./atendimento.ts";
import type { IrisConfig, ItemManual } from "./tipos.ts";

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

Deno.test("rajada: no máximo 3 chamadas; a terceira é gravada mesmo com mensagem nova", async () => {
  const fake = montar(QUI_22H30);
  const c = cliente([fim("r1"), fim("r2"), fim("r3"), fim("r4")], async (n) => {
    await fake.salvarMensagem(fake.conversa.id, { autor: "paciente", texto: `extra ${n}`, status: "enviada" });
  });
  // A 3ª chamada grava o que voltou; a mensagem que chegou durante ela fica antes da resposta (não pendente).
  assertEquals(await rodar(fake, c, QUI_22H30, "oi"), "respondida");
  assertEquals(c.chamadas.length, 3);
  assertEquals(ultimaUser(c, 2), "oi\n\nextra 1\n\nextra 2");
  assertEquals(daIris(fake).map((m) => m.texto), ["r3"]);
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
  // A próxima chamada trava de novo e responde.
  const c = cliente([fim("Oi, Camila!")]);
  assertEquals(await rodar(fake, c, QUI_22H30), "respondida");
  assertEquals(c.chamadas.length, 1);
  assertEquals(daIris(fake).map((m) => m.texto), ["Oi, Camila!"]);
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
  await fake.salvarMensagem(fake.conversa.id, { autor: "iris", texto: "Oi!", status: "enviada" });
  assertEquals(await rodar(fake, c, QUI_22H30), "respondida");
  assertEquals(c.chamadas.length, 0);
  assertEquals(fake.mensagens.length, 2);
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
  const original = fake.salvarMensagem;
  fake.salvarMensagem = (id, m) => (m.autor === "iris" ? Promise.reject(new Error("banco fora")) : original(id, m));
  const c = cliente([fim("Oi!")]);
  await assertRejects(() => rodar(fake, c, QUI_22H30, "oi"), Error, "banco fora");
  assertEquals(c.chamadas.length, 1);
  assertEquals(daIris(fake).length, 0);
  assert(await fake.travar(fake.conversa.id, 120), "a trava deveria estar livre");
});

Deno.test("meta.uso vai na primeira mensagem do turno", async () => {
  const fake = montar(QUI_22H30);
  const c = cliente([fim("Oi, Camila!\n\nComo posso ajudar?")]);
  await rodar(fake, c, QUI_22H30, "oi");
  const [a, b] = daIris(fake);
  assertEquals(a.meta, { uso: { entrada: 10, saida: 5, cache_lido: 7, cache_escrito: 0 } });
  assertEquals(b.meta, {});
  assertEquals(fake.mensagens[0].meta, {});

  const bloqueada = montar(QUI_22H30);
  await rodar(bloqueada, cliente([{ stop_reason: "refusal", content: [], usage: USO }]), QUI_22H30, "oi");
  assertEquals(bloqueada.mensagens.at(-1)!.meta, { uso: { entrada: 10, saida: 5, cache_lido: 7, cache_escrito: 0 } });
});

Deno.test("reconferência após destravar responde mensagem que chegou durante a gravação", async () => {
  const fake = montar(QUI_22H30);
  const original = fake.salvarMensagem;
  let inserida = false;
  fake.salvarMensagem = async (id, m) => {
    const r = await original(id, m);
    if (m.autor === "iris" && !inserida) {
      inserida = true;
      await original(id, { autor: "paciente", texto: "e tem horário amanhã?", status: "enviada" });
    }
    return r;
  };
  const c = cliente([fim("A avaliação custa R$ 100."), fim("Tenho sexta às 9h ou às 9h30.")]);
  assertEquals(await rodar(fake, c, QUI_22H30, "quanto custa?"), "respondida");
  assertEquals(c.chamadas.length, 2);
  assert(ultimaUser(c, 1).includes("e tem horário amanhã?"));
  assertEquals(fake.mensagens.map((m) => m.autor), ["paciente", "iris", "paciente", "iris"]);
  assert(await fake.travar(fake.conversa.id, 120));
});

Deno.test("canal que não é o simulador: erro antes de gravar qualquer coisa", async () => {
  const fake = montar(QUI_22H30, {}, { canal: "whatsapp" });
  const c = cliente([fim("não deveria sair")]);
  await assertRejects(() => rodar(fake, c, QUI_22H30, "oi"), Error, "canal não suportado nesta fase");
  assertEquals([fake.mensagens.length, c.chamadas.length], [0, 0]);
});
