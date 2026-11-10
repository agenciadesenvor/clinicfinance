import { assert, assertEquals } from "@std/assert";
import { criarRepoFake } from "./repo_fake.ts";
import { efeitosSimulados, ETIQUETA_MOTIVO, executarFerramenta, FERRAMENTAS, type Ctx } from "./ferramentas.ts";
import type { Horarios, ItemManual } from "./tipos.ts";

const H: Horarios = {
  semana: {
    "1": { inicio: "09:00", fim: "18:00" }, "2": { inicio: "09:00", fim: "18:00" },
    "3": { inicio: "09:00", fim: "18:00" }, "4": { inicio: "09:00", fim: "18:00" },
    "5": { inicio: "09:00", fim: "18:00" }, "6": { inicio: "09:00", fim: "12:00" },
  },
  almoco: { inicio: "12:00", fim: "13:00" },
  excecoes: [],
};
const AGORA = new Date("2026-11-13T01:30:00Z"); // quinta 22:30 em Recife

function item(chave: string, sinal: number | null): ItemManual {
  return {
    chave, nome: chave, o_que_e: "", indicacao: "", preparo: "", cuidados: "", informa_preco: false,
    preco_texto: "", duracao_min: null, agenda_direto: true, sinal_centavos: sinal, aprovado: true,
  };
}

function montar(manual: ItemManual[] = []) {
  const fake = criarRepoFake({ agora: AGORA, manual, config: { horarios: H } });
  const ctx: Ctx = {
    repo: fake, efeitos: efeitosSimulados(fake, fake.conversa.id), agora: AGORA,
    conversa: fake.conversa, config: fake.config, manual: fake.manual,
  };
  return { fake, ctx };
}
const rodar = async (nome: string, input: unknown, ctx: Ctx) => JSON.parse(await executarFerramenta(nome, input, ctx));
const notas = (fake: ReturnType<typeof montar>["fake"]) => fake.mensagens.filter((m) => m.autor === "sistema").map((m) => m.texto);

Deno.test("segurar horário livre devolve valor e link do simulador", async () => {
  const { ctx } = montar();
  const r = await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:00" }, ctx);
  assertEquals([r.ok, r.valor, r.expira_em_minutos], [true, "R$ 100,00", 30]);
  assert(r.link.endsWith(r.reserva_id));
});

Deno.test("limpeza cobra só o sinal de R$ 65,00", async () => {
  const { ctx } = montar();
  const r = await rodar("segurar_horario", { procedimento: "limpeza_de_pele", data: "2026-11-13", hora: "09:00" }, ctx);
  assertEquals([r.ok, r.valor], [true, "R$ 65,00"]);
});

Deno.test("sinal vem do Manual quando positivo", async () => {
  const { ctx } = montar([item("avaliacao", 12345), item("limpeza_de_pele", 0)]);
  const a = await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:00" }, ctx);
  const l = await rodar("segurar_horario", { procedimento: "limpeza_de_pele", data: "2026-11-13", hora: "10:00" }, ctx);
  assertEquals([a.valor, l.valor], ["R$ 123,45", "R$ 65,00"]);
});

Deno.test("sucesso grava nota de sistema com o rótulo", async () => {
  const { fake, ctx } = montar();
  await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:00" }, ctx);
  assertEquals(notas(fake), ["⏳ Horário segurado por 30 minutos: Avaliação, sexta, 13/11, às 9h"]);
});

Deno.test("horário já ocupado: recusa com 2 alternativas e não cria reserva", async () => {
  const { fake, ctx } = montar();
  fake.ocupar({ data: "2026-11-13", inicio: "09:00", fim: "10:00", procedimento: "Limpeza" });
  const r = await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:30" }, ctx);
  assertEquals([r.ok, r.motivo, r.alternativas.length, fake.reservas.length], [false, "horario_indisponivel", 2, 0]);
});

Deno.test("horário fora das regras (domingo) é recusado mesmo sem ocupação", async () => {
  const { fake, ctx } = montar();
  const r = await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-15", hora: "10:00" }, ctx);
  assertEquals([r.ok, fake.reservas.length], [false, 0]);
});

Deno.test("corrida: horário livre na consulta mas a reserva atômica recusa", async () => {
  const { fake, ctx } = montar();
  fake.recusarProximaReserva();
  const r = await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:00" }, ctx);
  assertEquals([r.ok, r.motivo, r.alternativas.length], [false, "horario_indisponivel", 2]);
});

Deno.test("a reserva ativa da própria conversa não bloqueia a nova tentativa", async () => {
  const { fake, ctx } = montar();
  const a = await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:00" }, ctx);
  const b = await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:00" }, ctx);
  assertEquals([a.ok, b.ok], [true, true]);
  assertEquals(fake.reservas.map((r) => r.status), ["cancelada", "ativa"]);
});

Deno.test("reserva ativa de outra conversa de teste bloqueia", async () => {
  const { fake, ctx } = montar();
  fake.reservas.push({
    id: "outra", conversa_id: "outra-conversa", procedimento: "avaliacao", data: "2026-11-13", hora_inicio: "09:00",
    hora_fim: "09:30", valor_centavos: 10000, status: "ativa", teste: true, expira_em: "2026-11-13T02:00:00.000Z",
  });
  const r = await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:00" }, ctx);
  assertEquals(r.ok, false);
});

Deno.test("consultar_horarios devolve no máximo 6, com rótulo", async () => {
  const { ctx } = montar();
  const r = await rodar("consultar_horarios", { procedimento: "avaliacao", a_partir_de: null, periodo: "qualquer" }, ctx);
  assertEquals(r.horarios.length, 6);
  assertEquals(r.horarios[0], { data: "2026-11-13", hora: "09:00", rotulo: "sexta, 13/11, às 9h" });
});

Deno.test("consultar_horarios sem vagas avisa", async () => {
  const { ctx } = montar();
  // sábado à tarde está fechado
  const r = await rodar("consultar_horarios", { procedimento: "avaliacao", a_partir_de: "2026-11-14", periodo: "tarde" }, ctx);
  assert(r.horarios.length > 0); // há tarde em dias úteis seguintes
  ctx.config.horarios = { ...H, semana: { "1": null, "2": null, "3": null, "4": null, "5": null, "6": null } };
  const v = await rodar("consultar_horarios", { procedimento: "avaliacao", a_partir_de: null, periodo: "qualquer" }, ctx);
  assertEquals(v, { horarios: [], aviso: "sem_horarios_no_periodo" });
});

Deno.test("registrar_qualificacao mescla sem apagar chaves anteriores", async () => {
  const { fake, ctx } = montar();
  const nulos = { quer_melhorar: null, ja_fez: null, momento: null, origem: null, nome: null };
  await rodar("registrar_qualificacao", { ...nulos, nome: "Camila", origem: "Instagram" }, ctx);
  const r = await rodar("registrar_qualificacao", { ...nulos, momento: "mês que vem" }, ctx);
  assertEquals(r, { ok: true });
  const esperado = { nome: "Camila", origem: "Instagram", momento: "mês que vem" };
  assertEquals(fake.conversa.qualificacao, esperado);
  assertEquals(ctx.conversa.qualificacao, esperado);
});

Deno.test("chamar_equipe muda o estado e deixa nota", async () => {
  const { fake, ctx } = montar();
  const r = await rodar("chamar_equipe", { motivo: "paciente pediu para falar com gente" }, ctx);
  assertEquals(r, { ok: true });
  assertEquals([fake.conversa.estado, fake.conversa.equipe_desde], ["equipe", AGORA.toISOString()]);
  assertEquals(ctx.conversa.estado, "equipe");
  assertEquals(notas(fake), ["🙋 A Íris chamou a equipe: paciente pediu para falar com gente"]);
});

Deno.test("passar_para_dra urgente: pendência + 2 etiquetas + aviso, tudo como nota no simulador", async () => {
  const { fake, ctx } = montar();
  await rodar("passar_para_dra", { motivo: "duvida_clinica", resumo: "inchaço forte após preenchimento", urgente: true }, ctx);
  assertEquals(fake.pendencias[0].urgente, true);
  const n = notas(fake);
  assertEquals(n, [
    "🏷️ Etiqueta que seria aplicada: Dúvida clínica",
    "📌 O card iria para: aguardando_dra",
    "🏷️ Etiqueta que seria aplicada: 🚨 Urgente",
    "🚨 A Dra. receberia agora um aviso no WhatsApp: inchaço forte após preenchimento",
  ]);
});

Deno.test("passar_para_dra não urgente não avisa", async () => {
  const { fake, ctx } = montar();
  const r = await rodar("passar_para_dra", { motivo: "desconto", resumo: "pediu desconto", urgente: false }, ctx);
  assertEquals(r, { ok: true });
  assertEquals(notas(fake).length, 2);
  assertEquals(ETIQUETA_MOTIVO.fora_do_manual, "Dúvida clínica");
});

Deno.test("ferramenta desconhecida ou entrada inválida devolve erro em JSON, sem lançar", async () => {
  const { ctx } = montar();
  assertEquals((await rodar("apagar_tudo", {}, ctx)).erro, "ferramenta_desconhecida");
  assertEquals((await rodar("segurar_horario", { procedimento: "botox" }, ctx)).erro, "entrada_invalida");
  assertEquals((await rodar("segurar_horario", { procedimento: "avaliacao", data: "13/11", hora: "09:00" }, ctx)).erro, "entrada_invalida");
  assertEquals((await rodar("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "9h" }, ctx)).erro, "entrada_invalida");
  assertEquals((await rodar("chamar_equipe", null, ctx)).erro, "entrada_invalida");
});

Deno.test("falha do repositório vira falha_interna", async () => {
  const { fake, ctx } = montar();
  fake.ocupados = () => Promise.reject(new Error("banco fora do ar"));
  const original = console.error;
  console.error = () => {};
  try {
    const r = await rodar("consultar_horarios", { procedimento: "avaliacao", a_partir_de: null, periodo: "qualquer" }, ctx);
    assertEquals(r.erro, "falha_interna");
  } finally {
    console.error = original;
  }
});

Deno.test("efeitos simulados gravam exatamente as notas combinadas", async () => {
  const { fake } = montar();
  const e = efeitosSimulados(fake, fake.conversa.id);
  await e.etiquetar("Desconto");
  await e.moverCard("aguardando_dra");
  await e.criarAgendamento({ procedimento: "Avaliação", data: "2026-11-13", inicio: "09:00", fim: "09:30" });
  await e.avisarDraUrgente("dor forte");
  assertEquals(notas(fake), [
    "🏷️ Etiqueta que seria aplicada: Desconto",
    "📌 O card iria para: aguardando_dra",
    "📅 Agendamento que seria criado: Avaliação, sexta, 13/11, às 9h",
    "🚨 A Dra. receberia agora um aviso no WhatsApp: dor forte",
  ]);
});

Deno.test("todas as ferramentas são strict e fecham o schema", () =>
  FERRAMENTAS.forEach((f) => {
    assert(f.strict === true);
    const s = f.input_schema as unknown as { additionalProperties: boolean; properties: object; required: string[] };
    assertEquals(s.additionalProperties, false);
    assertEquals([...s.required].sort(), Object.keys(s.properties).sort());
  }));
