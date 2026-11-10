import { assert, assertEquals } from "@std/assert";
import { criarRepoFake } from "./repo_fake.ts";
import { efeitosSimulados, FERRAMENTAS, type Ctx } from "./ferramentas.ts";
import { type ClienteClaude, MAX_ITERACOES, responder } from "./cerebro.ts";

// deno-lint-ignore no-explicit-any
type Resp = any;
type Fila = ClienteClaude & { chamadas: Record<string, unknown>[] };

const USO = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const resp = (stop_reason: string, content: unknown[], usage: Resp = USO): Resp => ({ stop_reason, content, usage });

const fim = (texto: string) => resp("end_turn", [{ type: "text", text: texto }]);
const usa = (nome: string, input: unknown, id = "tu_1") =>
  resp("tool_use", [{ type: "tool_use", id, name: nome, input }]);
const recusa = () => resp("refusal", []);
const cortada = (texto: string) => resp("max_tokens", [{ type: "text", text: texto }]);

function fila(respostas: Resp[]): Fila {
  const restantes = [...respostas];
  const chamadas: Record<string, unknown>[] = [];
  return {
    chamadas,
    criar(params) {
      chamadas.push(structuredClone(params)); // messages é alterado entre iterações
      const r = restantes.shift();
      return r ? Promise.resolve(r) : Promise.reject(new Error("fila vazia"));
    },
  };
}
function falha(): ClienteClaude {
  return { criar: () => Promise.reject(new Error("api fora do ar")) };
}

const AGORA = new Date("2026-11-13T01:30:00Z");
function base(cliente: ClienteClaude) {
  const fake = criarRepoFake({ agora: AGORA });
  const ctx: Ctx = {
    repo: fake, efeitos: efeitosSimulados(fake, fake.conversa.id), agora: AGORA,
    conversa: fake.conversa, config: fake.config, manual: fake.manual,
  };
  return {
    ctx, systemEstavel: "regras estáveis", systemContexto: "contexto da conversa com Camila",
    historico: [{ role: "user" as const, content: "Oi" }], autorizados: [100, 65, 130, 1000], cliente,
  };
}
const HORARIOS = { procedimento: "avaliacao", a_partir_de: null, periodo: "qualquer" };

Deno.test("texto simples vira mensagens", async () => {
  const r = await responder(base(fila([fim("Olá, Camila.\n\nO que você gostaria de melhorar no rosto?")])));
  assertEquals(r.textos.length, 2);
  assertEquals(r.bloqueio, null);
});

Deno.test("executa ferramenta e devolve o resultado num único turno user", async () => {
  const c = fila([usa("consultar_horarios", HORARIOS), fim("Tenho sexta às 9h ou às 9h30. Qual prefere?")]);
  await responder(base(c));
  // deno-lint-ignore no-explicit-any
  const segunda = c.chamadas[1].messages as any[];
  assertEquals(segunda.at(-2).role, "assistant");
  assertEquals(segunda.at(-1).content[0].type, "tool_result");
});

Deno.test("system: 1º bloco com cache e idêntico entre chamadas; modelo e fallbacks corretos", async () => {
  const c = fila([fim("oi")]);
  await responder(base(c));
  // deno-lint-ignore no-explicit-any
  const p = c.chamadas[0] as any;
  assertEquals([p.model, p.fallbacks, p.system[0].cache_control.type, p.system[1].cache_control], [
    "claude-opus-5-5", "default", "ephemeral", undefined,
  ]);
  assert(!("temperature" in p) && !("tool_choice" in p));
  assertEquals(p.betas, ["server-side-fallback-2026-07-01"]);
  assertEquals(p.thinking, { type: "adaptive" });
  assertEquals(p.output_config, { effort: "medium" });
  assertEquals(p.max_tokens, 16000);
  assertEquals(p.system[0].text, "regras estáveis");
  assertEquals(p.system[1].text, "contexto da conversa com Camila");
  assertEquals(p.tools, JSON.parse(JSON.stringify(FERRAMENTAS)));
  assertEquals(p.messages, [{ role: "user", content: "Oi" }]);
});

Deno.test("recusa, erro da API e corte: nada para a paciente", async () => {
  assertEquals((await responder(base(fila([recusa()])))).bloqueio, "recusa");
  const original = console.error;
  console.error = () => {};
  try {
    assertEquals((await responder(base(falha()))).bloqueio, "erro_api");
  } finally {
    console.error = original;
  }
  const r = await responder(base(fila([cortada("Olá, Cam")])));
  assertEquals([r.bloqueio, r.textos], ["resposta_cortada", []]);
});

Deno.test("pára em 6 iterações sem executar as ferramentas da última", async () => {
  const c = fila(Array(10).fill(usa("consultar_horarios", HORARIOS)));
  const r = await responder(base(c));
  assertEquals(r.bloqueio, "limite_iteracoes");
  assertEquals(r.textos, []);
  assertEquals(MAX_ITERACOES, 6);
  assertEquals(c.chamadas.length, 6);
  // deno-lint-ignore no-explicit-any
  assertEquals((c.chamadas[5].messages as any[]).length, 1 + 2 * 5);
});

Deno.test("valor fora da lista bloqueia mas preserva o texto para revisão", async () => {
  const r = await responder(base(fila([fim("O preenchimento sai por R$ 1.450.")])));
  assertEquals(r.bloqueio, "valor_nao_autorizado");
  assertEquals(r.textos.length, 1);
});

Deno.test("duas ferramentas na mesma resposta: executadas em ordem, resultados num só turno user", async () => {
  const dois = resp("tool_use", [
    { type: "tool_use", id: "tu_a", name: "consultar_horarios", input: HORARIOS },
    { type: "tool_use", id: "tu_b", name: "ferramenta_que_nao_existe", input: {} },
  ]);
  const c = fila([dois, fim("ok")]);
  await responder(base(c));
  // deno-lint-ignore no-explicit-any
  const msgs = c.chamadas[1].messages as any[];
  assertEquals(msgs.length, 3);
  const resultados = msgs[2].content;
  assertEquals(msgs[2].role, "user");
  assertEquals(resultados.map((x: Resp) => [x.type, x.tool_use_id]), [["tool_result", "tu_a"], ["tool_result", "tu_b"]]);
  assert(typeof resultados[0].content === "string");
  assertEquals(JSON.parse(resultados[1].content), { erro: "ferramenta_desconhecida" });
});

Deno.test("o turno assistant é o conteúdo recebido, sem alteração (inclui thinking)", async () => {
  const conteudo = [
    { type: "thinking", thinking: "preciso ver a agenda", signature: "assinatura" },
    { type: "text", text: "Vou consultar." },
    { type: "tool_use", id: "tu_1", name: "consultar_horarios", input: HORARIOS },
  ];
  const c = fila([resp("tool_use", conteudo), fim("pronto")]);
  await responder(base(c));
  // deno-lint-ignore no-explicit-any
  const msgs = c.chamadas[1].messages as any[];
  assertEquals(msgs[1], { role: "assistant", content: conteudo });
});

Deno.test("system e tools idênticos entre a 1ª e a 2ª chamada do turno", async () => {
  const c = fila([usa("consultar_horarios", HORARIOS), fim("ok")]);
  await responder(base(c));
  assertEquals(c.chamadas[1].system, c.chamadas[0].system);
  assertEquals(c.chamadas[1].tools, c.chamadas[0].tools);
});

Deno.test("uso soma as iterações, com campos de cache nulos contando zero", async () => {
  const c = fila([
    resp("tool_use", [{ type: "tool_use", id: "t", name: "consultar_horarios", input: HORARIOS }], {
      input_tokens: 100, output_tokens: 20, cache_read_input_tokens: null, cache_creation_input_tokens: 300,
    }),
    resp("end_turn", [{ type: "text", text: "ok" }], { input_tokens: 40, output_tokens: 7, cache_read_input_tokens: 300 }),
  ]);
  const r = await responder(base(c));
  assertEquals(r.uso, { entrada: 140, saida: 27, cache_lido: 300, cache_escrito: 300 });
});

Deno.test("end_turn sem texto vira resposta_cortada", async () => {
  const r = await responder(base(fila([resp("end_turn", [{ type: "thinking", thinking: "...", signature: "s" }])])));
  assertEquals([r.bloqueio, r.textos], ["resposta_cortada", []]);
});

Deno.test("blocos de texto são juntados com linha em branco; pause_turn continua", async () => {
  const c = fila([
    resp("pause_turn", [{ type: "text", text: "parcial" }]),
    resp("end_turn", [{ type: "text", text: "Primeiro." }, { type: "text", text: "Segundo." }]),
  ]);
  const r = await responder(base(c));
  assertEquals(c.chamadas.length, 2);
  // deno-lint-ignore no-explicit-any
  assertEquals((c.chamadas[1].messages as any[]).at(-1), { role: "assistant", content: [{ type: "text", text: "parcial" }] });
  assertEquals(r.textos, ["Primeiro.", "Segundo."]);
});

async function semConsoleError<T>(f: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = original;
  }
}

Deno.test("stop_reason nulo ou desconhecido falha fechado, sem texto", async () => {
  for (const sr of [null, "model_context_window_exceeded"]) {
    const r = await semConsoleError(() => responder(base(fila([resp(sr as never, [{ type: "text", text: "Olá." }])]))));
    assertEquals([r.bloqueio, r.textos], ["erro_api", []]);
  }
});

Deno.test("resposta sem content não lança: erro_api", async () => {
  const r = await semConsoleError(() => responder(base(fila([{ stop_reason: "end_turn", usage: USO }]))));
  assertEquals([r.bloqueio, r.textos], ["erro_api", []]);
});

Deno.test("falha na 2ª chamada depois de uma ferramenta: erro_api e uso da 1ª preservado", async () => {
  const c = fila([usa("consultar_horarios", HORARIOS)]); // a 2ª chamada rejeita (fila vazia)
  const r = await semConsoleError(() => responder(base(c)));
  assertEquals([r.bloqueio, r.textos], ["erro_api", []]);
  assertEquals(r.uso, { entrada: 10, saida: 5, cache_lido: 0, cache_escrito: 0 });
});

Deno.test("antesDeCadaChamada falso: para antes da chamada, sem mais ferramentas", async () => {
  const PASSAR = { motivo: "duvida_clinica", resumo: "dúvida", urgente: false };
  const c = fila([usa("passar_para_dra", PASSAR, "tu_1"), usa("passar_para_dra", PASSAR, "tu_2"), fim("ok")]);
  const p = base(c);
  let consultas = 0;
  const r = await responder({ ...p, antesDeCadaChamada: () => Promise.resolve(++consultas < 2) });
  assertEquals(consultas, 2);
  assertEquals(c.chamadas.length, 1);
  // deno-lint-ignore no-explicit-any
  assertEquals((p.ctx.repo as any).pendencias.length, 1); // só a ferramenta da 1ª resposta rodou
  assertEquals([r.textos, r.bloqueio], [[], "erro_api"]);
});
