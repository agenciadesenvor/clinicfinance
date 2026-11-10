// Confirmação de pagamento de uma reserva: sem HTTP, sem SQL, sem relógio (quem chama passa `agora`).
import { duracaoOcupado, rotuloSlot, slotsLivres } from "./horarios.ts";
import { ocupadosJanela } from "./ferramentas.ts";
import type { Repo } from "./repo.ts";
import type { Efeitos, IrisConfig, Procedimento, Reserva } from "./tipos.ts";

export type Resultado = "confirmada" | "ja_confirmada" | "horario_perdido" | "inexistente";

const LEGIVEL: Record<Procedimento, string> = { avaliacao: "avaliação", limpeza_de_pele: "limpeza de pele" };
const paraMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const vocativo = (nome: string) => (nome.trim() ? `, ${nome.trim()}` : "");
const rotuloDe = (r: Reserva) => rotuloSlot({ data: r.data, hora: r.hora_inicio, fim: r.hora_fim });

export async function confirmarReserva(p: {
  repo: Repo; efeitos: Efeitos; reservaId: string; agora: Date; config: IrisConfig; nome: string;
}): Promise<Resultado> {
  const { repo, efeitos, agora, config } = p;
  const r = await repo.reserva(p.reservaId);
  if (!r) return "inexistente";
  if (r.status === "paga") return "ja_confirmada";
  if (r.status === "expirada") return "horario_perdido"; // o caminho do horário perdido já rodou

  const noPrazo = r.status === "ativa" && new Date(r.expira_em).getTime() > agora.getTime();
  const userId = noPrazo ? "" : (await repo.carregar(r.conversa_id))?.conversa.user_id;
  if (userId === undefined) throw new Error(`conversa ${r.conversa_id} não existe`);

  if (!noPrazo && await horarioOcupado(repo, userId, r)) return await perderHorario(p, r, userId);

  if (!await repo.pagarReserva(r.id)) return "ja_confirmada";
  await efeitos.criarAgendamento({ procedimento: LEGIVEL[r.procedimento], data: r.data, inicio: r.hora_inicio, fim: r.hora_fim });
  await efeitos.moverCard("agendado");
  await efeitos.etiquetar("Sinal pago");
  const textos = [
    `Pagamento confirmado${vocativo(p.nome)}. Sua ${LEGIVEL[r.procedimento]} está marcada para ${rotuloDe(r)}.`,
    config.endereco.trim(),
    "Um dia antes eu te envio uma confirmação.",
  ].filter((t) => t !== "");
  await repo.salvarMensagens(r.conversa_id, textos.map((texto) => ({ autor: "iris", texto, status: "enviada" })));
  return "confirmada";
}

// Sobreposição meio-aberta [início, fim) contra tudo que ocupa a agenda, exceto a própria conversa.
async function horarioOcupado(repo: Repo, userId: string, r: Reserva): Promise<boolean> {
  const ocupados = await repo.ocupados(userId, r.data, r.data, { incluirTestes: r.teste, excetoConversaId: r.conversa_id });
  const ini = paraMin(r.hora_inicio), fim = paraMin(r.hora_fim);
  return ocupados.some((o) => {
    if (o.data !== r.data) return false;
    const oi = paraMin(o.inicio);
    return oi < fim && ini < (o.fim ? paraMin(o.fim) : oi + duracaoOcupado(o));
  });
}

async function perderHorario(
  p: Parameters<typeof confirmarReserva>[0], r: Reserva, userId: string,
): Promise<Resultado> {
  const { repo, agora, config } = p;
  await repo.marcarReserva(r.id, "expirada");
  await repo.abrirPendencia(r.conversa_id, {
    motivo: "pagamento_apos_prazo", urgente: false,
    resumo: `Pagamento recebido depois do prazo e o horário de ${rotuloDe(r)} já estava ocupado. Valor fica como crédito.`,
  });
  const ocupados = await ocupadosJanela({ repo, userId, agora, incluirTestes: r.teste });
  const livres = slotsLivres({ agora, procedimento: r.procedimento, horarios: config.horarios, ocupados, max: 2 });
  const base = `Recebi seu pagamento${vocativo(p.nome)}, mas esse horário acabou de ser ocupado. Seu valor fica como crédito.`;
  const texto = livres.length === 2
    ? `${base} Posso te oferecer ${rotuloSlot(livres[0])} ou ${rotuloSlot(livres[1])}?`
    : `${base} A equipe vai falar com você para remarcar.`;
  await repo.salvarMensagens(r.conversa_id, [{ autor: "iris", texto, status: "enviada" }]);
  return "horario_perdido";
}
