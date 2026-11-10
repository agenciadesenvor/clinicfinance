// As cinco ferramentas da Íris, a execução delas e os efeitos simulados do simulador.
import type Anthropic from "@anthropic-ai/sdk";
import { agoraRecife, DURACAO_MIN, rotuloSlot, slotsLivres } from "./horarios.ts";
import type { Repo } from "./repo.ts";
import type { Conversa, Efeitos, IrisConfig, ItemManual, Procedimento, Slot } from "./tipos.ts";

export interface Ctx {
  repo: Repo; efeitos: Efeitos; agora: Date; conversa: Conversa; config: IrisConfig; manual: ItemManual[];
}
export type Ferramenta = Anthropic.Beta.Messages.BetaTool & { strict: true };

export const ETIQUETA_MOTIVO: Record<string, string> = {
  duvida_clinica: "Dúvida clínica", desconto: "Desconto", insatisfeita: "Insatisfeita",
  outro_profissional: "Outro profissional", fora_do_manual: "Dúvida clínica", cancelamento: "Cancelamento",
  foto_para_avaliar: "Avaliar foto",
};

const PROCS = ["avaliacao", "limpeza_de_pele"];
const MOTIVOS = Object.keys(ETIQUETA_MOTIVO);
const NOME_PROC: Record<Procedimento, string> = { avaliacao: "Avaliação", limpeza_de_pele: "Limpeza de pele" };
const SINAL_PADRAO: Record<Procedimento, number> = { avaliacao: 10000, limpeza_de_pele: 6500 };
const QUALIFICACAO = ["quer_melhorar", "ja_fez", "momento", "origem", "nome"] as const;

const texto = (descricao: string) => ({ type: ["string", "null"], description: descricao });
function fechar(properties: Record<string, unknown>): Ferramenta["input_schema"] {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    name: "consultar_horarios", strict: true,
    description: "Lista até 6 horários livres para um procedimento. Chame antes de oferecer qualquer horário à paciente.",
    input_schema: fechar({
      procedimento: { type: "string", enum: PROCS },
      a_partir_de: texto("Data YYYY-MM-DD para começar a busca, ou null para hoje."),
      periodo: { type: "string", enum: ["manha", "tarde", "qualquer"] },
    }),
  },
  {
    name: "segurar_horario", strict: true,
    description:
      "Segura por 30 minutos um horário escolhido pela paciente e devolve o valor do sinal e o link de pagamento. Chame só depois de ela escolher um horário que veio de consultar_horarios.",
    input_schema: fechar({
      procedimento: { type: "string", enum: PROCS },
      data: { type: "string", description: "Data no formato YYYY-MM-DD." },
      hora: { type: "string", description: "Hora de início no formato HH:MM." },
    }),
  },
  {
    name: "registrar_qualificacao", strict: true,
    description: "Anota o que a paciente contou sobre si. Chame quando ela disser algo novo; use null no que não souber.",
    input_schema: fechar({
      quer_melhorar: texto("O que ela quer melhorar."), ja_fez: texto("Se já fez procedimentos antes."),
      momento: texto("Quando pretende fazer."), origem: texto("Como conheceu a clínica."), nome: texto("Nome da paciente."),
    }),
  },
  {
    name: "passar_para_dra", strict: true,
    description:
      "Encaminha o caso para a Dra. Patrícia e avisa a paciente que ela responde. Chame para dúvida clínica, desconto, insatisfação, cancelamento, foto para avaliar ou algo fora do Manual.",
    input_schema: fechar({
      motivo: { type: "string", enum: MOTIVOS },
      resumo: { type: "string", description: "Resumo curto do que a Dra. precisa saber." },
      urgente: { type: "boolean", description: "True só se houver risco ou queixa pós-procedimento." },
    }),
  },
  {
    name: "chamar_equipe", strict: true,
    description: "Entrega a conversa para a equipe humana e pausa a Íris. Chame quando a paciente pedir uma pessoa ou você não puder ajudar.",
    input_schema: fechar({ motivo: { type: "string", description: "Por que a equipe precisa assumir." } }),
  },
];

class EntradaInvalida extends Error {}
const invalida = (): never => { throw new EntradaInvalida(); };

type Obj = Record<string, unknown>;
function objeto(x: unknown, chaves: readonly string[]): Obj {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return invalida();
  const o = x as Obj;
  for (const k of chaves) if (!(k in o)) invalida();
  return o;
}
const enumDe = <T extends string>(v: unknown, opcoes: readonly string[]): T =>
  (typeof v === "string" && opcoes.includes(v) ? v : invalida()) as T;
const str = (v: unknown): string => (typeof v === "string" ? v : invalida());
const strOuNull = (v: unknown): string | null => (v === null ? null : str(v));
function dataValida(v: unknown): string {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return invalida();
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? invalida() : s;
}
function horaValida(v: unknown): string {
  const s = str(v);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : invalida();
}

const somaDias = (data: string, n: number) => new Date(Date.parse(`${data}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const rotulado = (s: Slot) => ({ data: s.data, hora: s.hora, rotulo: rotuloSlot(s) });

function reais(centavos: number): string {
  const [int, dec] = (centavos / 100).toFixed(2).split(".");
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}
function sinalDe(proc: Procedimento, manual: ItemManual[]): number {
  const s = manual.find((i) => i.chave === proc)?.sinal_centavos;
  return typeof s === "number" && s > 0 ? s : SINAL_PADRAO[proc];
}

// Ocupados de hoje a +15 dias; reservas de teste só contam no simulador, e a própria reserva ativa não bloqueia.
function ocupadosDe(ctx: Ctx) {
  const hoje = agoraRecife(ctx.agora).data;
  return ctx.repo.ocupados(ctx.conversa.user_id, hoje, somaDias(hoje, 15), {
    incluirTestes: ctx.conversa.canal === "simulador", excetoConversaId: ctx.conversa.id,
  });
}

async function consultarHorarios(entrada: unknown, ctx: Ctx) {
  const o = objeto(entrada, ["procedimento", "a_partir_de", "periodo"]);
  const procedimento = enumDe<Procedimento>(o.procedimento, PROCS);
  const aPartirDe = o.a_partir_de === null ? undefined : dataValida(o.a_partir_de);
  const periodo = enumDe<"manha" | "tarde" | "qualquer">(o.periodo, ["manha", "tarde", "qualquer"]);
  const ocupados = await ocupadosDe(ctx);
  const slots = slotsLivres({ agora: ctx.agora, procedimento, horarios: ctx.config.horarios, ocupados, aPartirDe, periodo, max: 6 });
  return slots.length ? { horarios: slots.map(rotulado) } : { horarios: [], aviso: "sem_horarios_no_periodo" };
}

async function segurarHorario(entrada: unknown, ctx: Ctx) {
  const o = objeto(entrada, ["procedimento", "data", "hora"]);
  const proc = enumDe<Procedimento>(o.procedimento, PROCS);
  const data = dataValida(o.data);
  const hora = horaValida(o.hora);
  const ocupados = await ocupadosDe(ctx);
  const base = { agora: ctx.agora, procedimento: proc, horarios: ctx.config.horarios, ocupados };
  const slot = slotsLivres({ ...base, aPartirDe: data, max: 400 }).find((s) => s.data === data && s.hora === hora);
  const reserva = slot ? await ctx.repo.segurar(ctx.conversa.id, proc, slot, sinalDe(proc, ctx.manual)) : null;
  if (!slot || !reserva) {
    const alternativas = slotsLivres({ ...base, max: 2 }).map(rotulado);
    return { ok: false, motivo: "horario_indisponivel", alternativas };
  }
  await ctx.repo.salvarMensagem(ctx.conversa.id, {
    autor: "sistema", status: "enviada",
    texto: `⏳ Horário segurado por 30 minutos: ${NOME_PROC[proc]}, ${rotuloSlot(slot)}`,
  });
  return {
    ok: true, reserva_id: reserva.id, valor: reais(reserva.valor_centavos),
    // [pendente] o link real de pagamento (WhatsApp) vem na fase do Mercado Pago
    link: ctx.conversa.canal === "simulador" ? `https://pagamento.simulado/${reserva.id}` : null,
    expira_em_minutos: 30,
  };
}

async function registrarQualificacao(entrada: unknown, ctx: Ctx) {
  const o = objeto(entrada, QUALIFICACAO);
  const novos: Record<string, string> = {};
  for (const k of QUALIFICACAO) {
    const v = strOuNull(o[k]);
    if (v !== null) novos[k] = v;
  }
  const qualificacao = { ...ctx.conversa.qualificacao, ...novos };
  await ctx.repo.atualizarConversa(ctx.conversa.id, { qualificacao });
  ctx.conversa.qualificacao = qualificacao;
  return { ok: true };
}

async function passarParaDra(entrada: unknown, ctx: Ctx) {
  const o = objeto(entrada, ["motivo", "resumo", "urgente"]);
  const motivo = enumDe<string>(o.motivo, MOTIVOS);
  const resumo = str(o.resumo);
  if (typeof o.urgente !== "boolean") invalida();
  const urgente = o.urgente as boolean;
  await ctx.repo.abrirPendencia(ctx.conversa.id, { motivo, resumo, urgente });
  await ctx.efeitos.etiquetar(ETIQUETA_MOTIVO[motivo]);
  await ctx.efeitos.moverCard("aguardando_dra");
  if (urgente) {
    await ctx.efeitos.etiquetar("🚨 Urgente");
    await ctx.efeitos.avisarDraUrgente(resumo);
  }
  return { ok: true };
}

async function chamarEquipe(entrada: unknown, ctx: Ctx) {
  const motivo = str(objeto(entrada, ["motivo"]).motivo);
  const equipe_desde = ctx.agora.toISOString();
  await ctx.repo.atualizarConversa(ctx.conversa.id, { estado: "equipe", equipe_desde });
  ctx.conversa.estado = "equipe";
  ctx.conversa.equipe_desde = equipe_desde;
  await ctx.repo.salvarMensagem(ctx.conversa.id, { autor: "sistema", status: "enviada", texto: `🙋 A Íris chamou a equipe: ${motivo}` });
  return { ok: true };
}

const EXECUTORES: Record<string, (entrada: unknown, ctx: Ctx) => Promise<unknown>> = {
  consultar_horarios: consultarHorarios, segurar_horario: segurarHorario,
  registrar_qualificacao: registrarQualificacao, passar_para_dra: passarParaDra, chamar_equipe: chamarEquipe,
};

// Devolve sempre JSON em string; o modelo lê o erro e se ajusta.
export async function executarFerramenta(nome: string, input: unknown, ctx: Ctx): Promise<string> {
  const executar = Object.hasOwn(EXECUTORES, nome) ? EXECUTORES[nome] : null;
  if (!executar) return JSON.stringify({ erro: "ferramenta_desconhecida" });
  try {
    return JSON.stringify(await executar(input, ctx));
  } catch (e) {
    if (e instanceof EntradaInvalida) return JSON.stringify({ erro: "entrada_invalida" });
    console.error(`ferramenta ${nome} falhou:`, e);
    return JSON.stringify({ erro: "falha_interna" });
  }
}

// No simulador nada toca o CRM nem a agenda: cada efeito vira uma nota na conversa.
export function efeitosSimulados(repo: Repo, conversaId: string): Efeitos {
  const nota = (t: string) => repo.salvarMensagem(conversaId, { autor: "sistema", texto: t, status: "enviada" }).then(() => {});
  return {
    etiquetar: (nome) => nota(`🏷️ Etiqueta que seria aplicada: ${nome}`),
    moverCard: (status) => nota(`📌 O card iria para: ${status}`),
    criarAgendamento: (a) =>
      nota(`📅 Agendamento que seria criado: ${a.procedimento}, ${rotuloSlot({ data: a.data, hora: a.inicio, fim: a.fim })}`),
    avisarDraUrgente: (resumo) => nota(`🚨 A Dra. receberia agora um aviso no WhatsApp: ${resumo}`),
  };
}
