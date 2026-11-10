// Conversas-teste da Íris: roda cada caso pelo mesmo laço de produção (`responder`) e confere as regras.
// cd supabase/functions && npx -y deno run -A _evals/rodar.ts [--so id]... [--repeticoes N] [--verboso]
//   --simulado         usa o cliente falso (sem API); --simulado-ruim usa roteiros que quebram regras de propósito
// Sem --simulado, lê ANTHROPIC_API_KEY do ambiente e gasta tokens de verdade.
import { type ClienteClaude, clienteAnthropic, responder, type Resultado } from "../_shared/cerebro.ts";
import { emOrdemDeResposta } from "../_shared/atendimento.ts";
import { efeitosSimulados, type Ctx } from "../_shared/ferramentas.ts";
import { valoresAutorizados } from "../_shared/guardas.ts";
import { agoraRecife } from "../_shared/horarios.ts";
import { montarContexto, montarHistorico, montarSystem } from "../_shared/prompt.ts";
import { criarRepoFake } from "../_shared/repo_fake.ts";
import type { IrisConfig, ItemManual } from "../_shared/tipos.ts";
import { type Caso, CASOS } from "./casos.ts";
import { clienteSimulado } from "./simulado.ts";
import { verificar } from "./verificar.ts";

// Quinta-feira, 14:00 em Recife.
export const AGORA = new Date("2026-11-12T17:00:00Z");

const CONFIG: Partial<IrisConfig> = {
  modo: "automatico",
  endereco: "Rua Fictícia, 100 — Recife",
  como_chegar: "Perto da praça central, com estacionamento na porta.",
  formas_pagamento: "Pix, cartão de crédito e débito.",
  politica_cancelamento: "Remarcação sem custo com 24 horas de antecedência.",
  politica_atraso: "Tolerância de 15 minutos.",
};

const SEM_PRECO = "O valor é definido na avaliação";
const ITENS: [string, string, Partial<ItemManual>][] = [
  ["avaliacao", "Avaliação", { informa_preco: true, preco_texto: "R$ 100", duracao_min: 30, agenda_direto: true, sinal_centavos: 10000 }],
  ["botox", "Botox", { informa_preco: true, preco_texto: "A partir de R$ 1.000, depende das áreas" }],
  ["preenchimento_labial", "Preenchimento labial", {}],
  ["preenchimento_olheiras", "Preenchimento de olheiras", {}],
  ["fios_pdo", "Fios de PDO", {}],
  ["rinomodelacao", "Rinomodelação", {}],
  ["harmonizacao_facial", "Harmonização facial", {}],
  ["bioestimulador", "Bioestimulador", {}],
  ["skinbooster", "Skinbooster", {}],
  ["microagulhamento", "Microagulhamento", {}],
  ["limpeza_de_pele", "Limpeza de pele", { informa_preco: true, preco_texto: "R$ 130", duracao_min: 60, agenda_direto: true, sinal_centavos: 6500 }],
  ["peeling_quimico", "Peeling químico", {}],
  ["hialuronidase", "Hialuronidase", {}],
  ["laser", "Laser", {}],
];

export function manualDe(modo: "tudo_aprovado" | "nada_aprovado"): ItemManual[] {
  return ITENS.map(([chave, nome, regras]) => ({
    chave, nome, o_que_e: `${nome} é um procedimento do consultório (texto fictício para o teste).`,
    indicacao: "", preparo: "", cuidados: "",
    informa_preco: false, preco_texto: SEM_PRECO, duracao_min: null, agenda_direto: false, sinal_centavos: null,
    ...regras, aprovado: modo === "tudo_aprovado",
  }));
}

type Uso = Resultado["uso"];
export interface Metricas { uso: Uso; chamadasAoModelo: number }
export const metricasZeradas = (): Metricas => ({ uso: { entrada: 0, saida: 0, cache_lido: 0, cache_escrito: 0 }, chamadasAoModelo: 0 });

export interface Repeticao {
  falhas: string[]; textos: string[]; chamadas: { nome: string; input: Record<string, unknown> }[]; bloqueio: string | null;
}

// Uma repetição: conversa nova (repo fake vazio) e todos os turnos do caso em sequência.
export async function executarRepeticao(caso: Caso, cliente: ClienteClaude, m: Metricas): Promise<Repeticao> {
  const modoManual = caso.manual ?? "tudo_aprovado";
  const repo = criarRepoFake({ agora: AGORA, manual: manualDe(modoManual), config: CONFIG });
  const id = repo.conversa.id;
  let chamadas: Repeticao["chamadas"] = [];
  // Mesmo cliente, só anotando as ferramentas pedidas e contando as chamadas.
  const observador: ClienteClaude = {
    async criar(params) {
      m.chamadasAoModelo++;
      const r = await cliente.criar(params);
      if (Array.isArray(r.content)) {
        for (const b of r.content) {
          if (b.type === "tool_use") chamadas.push({ nome: b.name, input: b.input as Record<string, unknown> });
        }
      }
      return r;
    },
  };

  let r: Resultado = { textos: [], bloqueio: null, uso: m.uso };
  for (const [i, fala] of caso.turnos.entries()) {
    chamadas = []; // só as ferramentas do turno avaliado contam
    const msgId = await repo.salvarMensagem(id, { autor: "paciente", texto: fala, status: "enviada" });
    // Montagem igual à de atendimento.ts (secaoTravada), sem trava nem rascunho.
    const c = (await repo.carregar(id))!;
    const hoje = agoraRecife(AGORA).data;
    const ctx: Ctx = {
      repo, efeitos: efeitosSimulados(repo, id), agora: AGORA, conversa: c.conversa, config: c.config, manual: c.manual,
    };
    r = await responder({
      ctx, cliente: observador,
      systemEstavel: montarSystem({ config: c.config, manual: c.manual, promocoes: c.promocoes, hoje }),
      systemContexto: montarContexto({ agora: AGORA, conversa: c.conversa, pendencias: c.pendencias, reserva: c.reserva, canal: c.conversa.canal }),
      historico: montarHistorico(emOrdemDeResposta(c.mensagens)),
      autorizados: valoresAutorizados(c.manual, c.promocoes, hoje),
    });
    for (const k of Object.keys(m.uso) as (keyof Uso)[]) m.uso[k] += r.uso[k];
    const ultimo = i === caso.turnos.length - 1;
    if (r.bloqueio !== null && !ultimo) {
      return { falhas: [`o turno ${i + 1} foi bloqueado (${r.bloqueio})`], textos: r.textos, chamadas, bloqueio: r.bloqueio };
    }
    if (!ultimo) {
      // A resposta enviada entra no histórico do turno seguinte, como em produção.
      await repo.salvarMensagens(id, r.textos.map((texto, j) => ({
        autor: "iris" as const, texto, status: "enviada" as const, meta: j === 0 ? { cobre_ate: msgId } : undefined,
      })));
    }
  }
  const falhas = verificar(caso.espera, { textos: r.textos, chamadas, bloqueio: r.bloqueio });
  return { falhas, textos: r.textos, chamadas, bloqueio: r.bloqueio };
}

export interface ResultadoCaso { id: string; passou: number; total: number; reps: Repeticao[] }

export async function executarCaso(
  caso: Caso, repeticoes: number, fabrica: (id: string) => ClienteClaude, m: Metricas,
): Promise<ResultadoCaso> {
  const reps: Repeticao[] = [];
  for (let i = 0; i < repeticoes; i++) reps.push(await executarRepeticao(caso, fabrica(caso.id), m));
  return { id: caso.id, passou: reps.filter((r) => r.falhas.length === 0).length, total: repeticoes, reps };
}

function detalhar(r: Repeticao, n: number): string[] {
  const l = [`    repetição ${n}:`];
  for (const f of r.falhas) l.push(`      x ${f}`);
  l.push(...r.textos.map((t) => `      Íris: ${t.replace(/\n/g, "\n            ")}`));
  l.push(`      ferramentas: ${r.chamadas.map((c) => `${c.nome}(${JSON.stringify(c.input)})`).join("; ") || "nenhuma"}`);
  return l;
}

interface Opcoes { so: string[]; repeticoes: number; simulado: boolean; ruim: boolean; verboso: boolean }
function lerArgs(args: string[]): Opcoes | string {
  const o: Opcoes = { so: [], repeticoes: 3, simulado: false, ruim: false, verboso: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--so") {
      const v = args[++i];
      if (!v) return "--so precisa de um id de caso.";
      o.so.push(v);
    } else if (a === "--repeticoes") {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 1) return "--repeticoes precisa de um número inteiro maior que zero.";
      o.repeticoes = n;
    } else if (a === "--simulado") o.simulado = true;
    else if (a === "--simulado-ruim") o.simulado = o.ruim = true;
    else if (a === "--verboso") o.verboso = true;
    else return `Opção desconhecida: ${a}`;
  }
  return o;
}

async function principal(): Promise<number> {
  const o = lerArgs(Deno.args);
  if (typeof o === "string") {
    console.error(o);
    return 2;
  }
  const desconhecidos = o.so.filter((id) => !CASOS.some((c) => c.id === id));
  if (desconhecidos.length) {
    console.error(`Caso desconhecido: ${desconhecidos.join(", ")}. Casos: ${CASOS.map((c) => c.id).join(", ")}`);
    return 2;
  }
  if (!o.simulado && !Deno.env.get("ANTHROPIC_API_KEY")) {
    console.error("Falta a variável ANTHROPIC_API_KEY. Defina-a no ambiente, ou use --simulado para rodar sem a API.");
    return 1;
  }
  const real = o.simulado ? null : clienteAnthropic();
  const fabrica = (id: string): ClienteClaude => real ?? clienteSimulado(id, o.ruim);
  const casos = o.so.length ? CASOS.filter((c) => o.so.includes(c.id)) : CASOS;

  const m = metricasZeradas();
  const resultados: ResultadoCaso[] = [];
  for (const caso of casos) {
    const res = await executarCaso(caso, o.repeticoes, fabrica, m);
    resultados.push(res);
    const ok = res.passou === res.total;
    const primeira = res.reps.find((r) => r.falhas.length > 0)?.falhas[0];
    console.log(ok ? `PASSOU ${res.passou}/${res.total}  ${res.id}` : `FALHOU ${res.passou}/${res.total}  ${res.id}  — ${primeira}`);
    res.reps.forEach((r, i) => {
      if (r.falhas.length > 0 || o.verboso) console.log(detalhar(r, i + 1).join("\n"));
    });
  }
  const falharam = resultados.filter((r) => r.passou !== r.total).length;
  console.log(`\n${resultados.length - falharam} de ${resultados.length} casos passaram em todas as repetições (${o.repeticoes} por caso).`);
  const u = m.uso;
  console.log(`Chamadas ao modelo: ${m.chamadasAoModelo}`);
  console.log(`Tokens — entrada: ${u.entrada}, saída: ${u.saida}, cache lido: ${u.cache_lido}, cache escrito: ${u.cache_escrito}`);
  return falharam > 0 ? 1 : 0;
}

if (import.meta.main) Deno.exit(await principal());
