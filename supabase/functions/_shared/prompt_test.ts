import { assert, assertEquals } from "@std/assert";
import type { Conversa, IrisConfig, ItemManual, Mensagem, Reserva } from "./tipos.ts";
import { montarContexto, montarHistorico, montarSystem } from "./prompt.ts";
import { KIT } from "./kit.ts";

const C: IrisConfig = {
  modo: "supervisionado",
  horarios: { semana: { "1": null, "2": null, "3": null, "4": null, "5": null, "6": null }, almoco: { inicio: "12:00", fim: "13:00" }, excecoes: [] },
  endereco: "Rua Fictícia, 100", como_chegar: "", formas_pagamento: "Pix e cartão",
  politica_cancelamento: "", politica_atraso: "", nunca_dizer: "", frase_emergencia: "",
};

const item = (p: Partial<ItemManual> & { chave: string }): ItemManual => ({
  nome: p.chave, o_que_e: "", indicacao: "", preparo: "", cuidados: "", informa_preco: false, preco_texto: "",
  duracao_min: null, agenda_direto: false, sinal_centavos: null, aprovado: false, ...p,
});

const M: ItemManual[] = [
  item({ chave: "avaliacao", nome: "Avaliação", o_que_e: "TEXTO-AVAL", informa_preco: true, preco_texto: "R$ 100",
    duracao_min: 30, agenda_direto: true, sinal_centavos: 10000, aprovado: true }),
  item({ chave: "preenchimento_labial", nome: "Preenchimento labial", o_que_e: "TEXTO-SECRETO", aprovado: false }),
  item({ chave: "limpeza_de_pele", nome: "Limpeza de pele", informa_preco: true, preco_texto: "R$ 130",
    duracao_min: 60, agenda_direto: true, sinal_centavos: 6500, aprovado: true }),
];

const conversa: Conversa = {
  id: "c1", user_id: "u1", canal: "simulador", contato_nome: "Camila", estado: "iris", equipe_desde: null, qualificacao: {},
};

let seq = 0;
const msg = (autor: Mensagem["autor"], texto: string, status: Mensagem["status"]): Mensagem =>
  ({ id: String(++seq), autor, texto, status, created_at: new Date(Date.UTC(2026, 10, 12, 12, 0, seq)).toISOString() });

Deno.test("texto de item não aprovado não entra no prompt", () => {
  const s = montarSystem({ config: C, manual: M, promocoes: [], hoje: "2026-11-12" });
  assert(s.includes("TEXTO-AVAL")); assert(!s.includes("TEXTO-SECRETO"));
  assert(s.includes("Os textos descritivos deste procedimento"));
});
const blocoDe = (s: string, chave: string) => s.slice(s.indexOf(`(${chave})`), s.indexOf("\n\n", s.indexOf(`(${chave})`)));
Deno.test("item não aprovado: preço, agenda e sinal continuam valendo; dúvidas descritivas vão para a Dra.", () => {
  const aval = item({ chave: "avaliacao", nome: "Avaliação", o_que_e: "TEXTO-AVAL", informa_preco: true, preco_texto: "R$ 100",
    duracao_min: 30, agenda_direto: true, sinal_centavos: 10000, aprovado: false });
  const b = blocoDe(montarSystem({ config: C, manual: [aval], promocoes: [], hoje: "2026-11-12" }), "avaliacao");
  assert(b.includes("Preço que você pode informar: R$ 100"));
  assert(b.includes("Agendamento: você agenda direto."));
  assert(b.includes("Sinal para reservar: R$ 100,00"));
  assert(!b.includes("TEXTO-AVAL"));
  const marcador = b.split("\n").at(-1)!;
  assert(marcador.includes("fora_do_manual"), marcador);
  assert(/preço, agendamento e sinal/.test(marcador), marcador);
  assert(!/qualquer pergunta sobre este procedimento/.test(marcador), marcador);
});
Deno.test("só avaliação e limpeza de pele aparecem como 'você agenda direto', qualquer que seja o valor gravado", () => {
  const s = montarSystem({ config: C, hoje: "2026-11-12", promocoes: [], manual: [
    item({ chave: "botox", nome: "Botox", agenda_direto: true, sinal_centavos: 20000, duracao_min: 60 }),
    item({ chave: "limpeza_de_pele", nome: "Limpeza de pele", agenda_direto: false }),
  ] });
  const botox = blocoDe(s, "botox"), limpeza = blocoDe(s, "limpeza_de_pele");
  assert(!botox.includes("você agenda direto"), botox);
  assert(botox.includes("quem agenda é a clínica"), botox);
  assert(!botox.includes("R$ 200,00"), botox);
  assert(limpeza.includes("Agendamento: você agenda direto."), limpeza);
});
Deno.test("sinal no prompt é o mesmo que a ferramenta cobra (padrão quando o Manual não tem)", () => {
  const s = montarSystem({ config: C, hoje: "2026-11-12", promocoes: [], manual: [
    item({ chave: "avaliacao", nome: "Avaliação", sinal_centavos: null }),
    item({ chave: "limpeza_de_pele", nome: "Limpeza de pele", sinal_centavos: 0 }),
  ] });
  assert(blocoDe(s, "avaliacao").includes("Sinal para reservar: R$ 100,00"));
  assert(blocoDe(s, "limpeza_de_pele").includes("Sinal para reservar: R$ 65,00"));
  assert(!s.includes("Sinal para reservar: não há"));
});
Deno.test("tempo na agenda no prompt é o que a ferramenta usa", () => {
  const s = montarSystem({ config: C, hoje: "2026-11-12", promocoes: [], manual: [
    item({ chave: "avaliacao", nome: "Avaliação", duracao_min: 60 }),
    item({ chave: "limpeza_de_pele", nome: "Limpeza de pele", duracao_min: 45 }),
  ] });
  assert(blocoDe(s, "avaliacao").includes("Tempo na agenda: 60 min"));
  assert(blocoDe(s, "limpeza_de_pele").includes("Tempo na agenda: 60 min"));
});
Deno.test("texto aprovado sai sem a marca de rascunho do Manual padrão", () => {
  const s = montarSystem({ config: C, hoje: "2026-11-12", promocoes: [], manual: [
    item({ chave: "botox", nome: "Botox", aprovado: true, o_que_e: "Relaxa a musculatura. (rascunho — a Dra. revisa)  ",
      cuidados: " (rascunho — a Dra. revisa)" }),
  ] });
  const b = blocoDe(s, "botox");
  assert(b.includes("O que é: Relaxa a musculatura.\n") || b.endsWith("O que é: Relaxa a musculatura."), b);
  assert(!b.includes("rascunho"), b);
  assert(!b.includes("Cuidados depois"), b);
});
Deno.test("bloco estável não muda com a hora nem com a conversa", () => {
  const a = montarSystem({ config: C, manual: M, promocoes: [], hoje: "2026-11-12" });
  const b = montarSystem({ config: C, manual: [...M].reverse(), promocoes: [], hoje: "2026-11-12" });
  assertEquals(a, b);
});
Deno.test("promoção vencida fica de fora", () => {
  const s = montarSystem({ config: C, manual: M, hoje: "2026-11-12",
    promocoes: [{ procedimento_chave: "botox", descricao: "PROMO-VELHA", valido_ate: "2026-11-11" }] });
  assert(!s.includes("PROMO-VELHA"));
  assert(s.includes("Nenhuma promoção ativa no momento."));
});
Deno.test("promoção válida entra e a ordem das promoções não muda a saída", () => {
  const P = [
    { procedimento_chave: "botox", descricao: "PROMO-A", valido_ate: "2026-11-30" },
    { procedimento_chave: "avaliacao", descricao: "PROMO-B", valido_ate: "2026-11-12" },
  ];
  const a = montarSystem({ config: C, manual: M, promocoes: P, hoje: "2026-11-12" });
  const b = montarSystem({ config: C, manual: M, promocoes: [...P].reverse(), hoje: "2026-11-12" });
  assert(a.includes("PROMO-A") && a.includes("PROMO-B")); assertEquals(a, b);
});
Deno.test("system: KIT primeiro, depois informações práticas, Manual e promoções; sinal em reais", () => {
  const s = montarSystem({ config: C, manual: M, promocoes: [], hoje: "2026-11-12" });
  assert(s.startsWith(KIT));
  const i = s.indexOf("Informações práticas", KIT.length), m = s.indexOf("Manual", i), p = s.indexOf("Promoções válidas", m);
  assert(i > 0 && m > i && p > m);
  assert(s.includes("R$ 65,00")); assert(s.includes("30 min"));
  assert(s.includes("Rua Fictícia, 100"));
  assert(s.includes("(ainda não informado — se perguntarem, diga que vai confirmar com a equipe)"));
});
Deno.test("identidade: 'assistente virtual' só aparece em frase de proibição", () => {
  const frases = KIT.split(/(?<=[.!?:])\s+|\n+/).filter((f) => /assistente virtual/i.test(f));
  for (const f of frases) assert(/\b(nunca|não)\b/i.test(f), `frase sem negação: ${f}`);
});
Deno.test("identidade: apresentação e nunca nega ser IA", () => {
  assert(KIT.includes("Aqui é a Íris, do consultório da Dra. Patrícia."));
  assert(/nunca neg/i.test(KIT));
});
Deno.test("KIT cita as cinco ferramentas, a frase de passar para a Dra. e a convenção de saída", () => {
  for (const f of ["consultar_horarios", "segurar_horario", "registrar_qualificacao", "passar_para_dra", "chamar_equipe"]) {
    assert(KIT.includes(f), f);
  }
  assert(KIT.includes("Essa é uma pergunta para a Dra. Patrícia responder; não quero te passar informação errada. Vou falar com ela e já te retorno, tudo bem?"));
  assert(KIT.includes("cada parágrafo (separado por linha em branco) vira uma mensagem de WhatsApp; no máximo 3 por resposta"));
});
Deno.test("contexto: data, hora e dia da semana em Recife", () => {
  const s = montarContexto({ agora: new Date("2026-11-13T01:30:00Z"), conversa, pendencias: [], reserva: null, canal: "simulador" });
  assert(s.includes("22:30")); assert(s.includes("quinta")); assert(s.includes("12/11/2026")); assert(s.includes("Camila"));
});
Deno.test("contexto: reserva ativa com minutos restantes, qualificação e pendências", () => {
  const reserva: Reserva = {
    id: "r1", conversa_id: "c1", procedimento: "avaliacao", data: "2026-11-13", hora_inicio: "09:00", hora_fim: "09:30",
    valor_centavos: 10000, status: "ativa", teste: true, expira_em: "2026-11-13T01:42:40Z",
  };
  const s = montarContexto({
    agora: new Date("2026-11-13T01:30:00Z"), canal: "simulador", reserva,
    conversa: { ...conversa, qualificacao: { quer_melhorar: "olheiras" } },
    pendencias: [
      { id: "p1", motivo: "duvida_clinica", resumo: "pode fazer amamentando", urgente: false, status: "aberta" },
      { id: "p2", motivo: "desconto", resumo: "RESOLVIDA-X", urgente: false, status: "resolvida" },
    ],
  });
  assert(s.includes("12 min")); assert(s.includes("sexta, 13/11, às 9h"));
  assert(s.includes("olheiras")); assert(s.includes("pode fazer amamentando")); assert(!s.includes("RESOLVIDA-X"));
});
Deno.test("contexto: reserva vencida mostra 0 min, nunca negativo", () => {
  const reserva: Reserva = {
    id: "r1", conversa_id: "c1", procedimento: "avaliacao", data: "2026-11-13", hora_inicio: "09:00", hora_fim: "09:30",
    valor_centavos: 10000, status: "ativa", teste: true, expira_em: "2026-11-13T01:00:00Z",
  };
  const s = montarContexto({ agora: new Date("2026-11-13T01:30:00Z"), conversa, pendencias: [], reserva, canal: "simulador" });
  assert(s.includes("0 min")); assert(!s.includes("-30"));
});
Deno.test("histórico: rascunho e sistema ficam de fora; equipe vira assistant marcado; começa por user", () => {
  const h = montarHistorico([
    msg("iris", "Oi, Camila", "enviada"), msg("paciente", "oi", "enviada"),
    msg("iris", "rascunho x", "rascunho"), msg("sistema", "nota", "enviada"), msg("equipe", "Aqui é a Rosi", "enviada") ]);
  assertEquals(h.map(m => m.role), ["user", "assistant", "user", "assistant"]);
  assertEquals(h[0].content, "(início da conversa)"); assert(h[3].content.startsWith("(a equipe escreveu) "));
});
Deno.test("histórico: mensagens seguidas do mesmo papel são unidas", () => {
  const h = montarHistorico([msg("paciente", "oi", "enviada"), msg("paciente", "tudo bem?", "enviada"),
    msg("iris", "Olá", "enviada"), msg("equipe", "Oi", "enviada")]);
  assertEquals(h, [
    { role: "user", content: "oi\n\ntudo bem?" },
    { role: "assistant", content: "Olá\n\n(a equipe escreveu) Oi" },
  ]);
});
Deno.test("histórico: só as últimas 60 mensagens", () => {
  const ms: Mensagem[] = [];
  for (let i = 0; i < 70; i++) ms.push(msg(i % 2 === 0 ? "paciente" : "iris", `m${i}`, "enviada"));
  const h = montarHistorico(ms);
  assertEquals(h.length, 60);
  assertEquals(h[0], { role: "user", content: "m10" });
  assertEquals(h.at(-1), { role: "assistant", content: "m69" });
});
Deno.test("histórico: mensagens vazias ou só com espaços ficam de fora", () => {
  const h = montarHistorico([msg("paciente", "oi", "enviada"), msg("iris", "   \n ", "enviada"), msg("paciente", "", "enviada"),
    msg("iris", "Olá", "enviada")]);
  assertEquals(h, [{ role: "user", content: "oi" }, { role: "assistant", content: "Olá" }]);
});
