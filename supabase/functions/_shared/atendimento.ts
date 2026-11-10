// Um turno de atendimento: grava a mensagem da paciente, trava a conversa, decide se a Íris responde
// e grava a resposta como rascunho ou enviada. Não lê relógio: tudo usa `agora`.
import { type Bloqueio, type ClienteClaude, responder, type Resultado } from "./cerebro.ts";
import { type Ctx, efeitosSimulados } from "./ferramentas.ts";
import { valoresAutorizados } from "./guardas.ts";
import { agoraRecife, foraDoExpediente } from "./horarios.ts";
import { montarContexto, montarHistorico, montarSystem } from "./prompt.ts";
import type { Carregado, NovaMensagem, Repo } from "./repo.ts";
import type { IrisConfig, Mensagem } from "./tipos.ts";

export type Desfecho = "respondida" | "rascunho" | "equipe" | "enfileirada" | "bloqueada";
interface Turno { repo: Repo; cliente: ClienteClaude; conversaId: string; agora: Date }

const TRAVA_SEGUNDOS = 180;
const MAX_REPETICOES = 2; // rajada: até 3 chamadas ao modelo na mesma execução
const MAX_REEXECUCOES = 5; // reconferências depois de soltar a trava
const PAUSA_EQUIPE_MS = 12 * 3600_000;

const NOTAS: Record<Bloqueio, string> = {
  erro_api: "A Íris não conseguiu responder (falha técnica). Responda você ou peça para ela tentar de novo.",
  recusa: "A Íris não conseguiu concluir esta resposta. Responda você.",
  limite_iteracoes: "A Íris não conseguiu concluir esta resposta. Responda você.",
  resposta_cortada: "A Íris não conseguiu concluir esta resposta. Responda você.",
  valor_nao_autorizado: "A Íris citou um valor que não está no Manual. Confira antes de enviar.",
};

const cobreAte = (m: Mensagem): unknown => (m.meta as { cobre_ate?: unknown } | null | undefined)?.cobre_ate;

// Mensagens da paciente ainda sem resposta. Cobrem: uma resposta enviada da Íris até a mensagem do seu
// `cobre_ate` (a mais nova que o modelo viu) e uma mensagem enviada da equipe até ela mesma.
// Rascunho e descartada não cobrem. Marcador com id desconhecido cobre até a própria mensagem da Íris.
export function pendentes(msgs: Mensagem[]): Mensagem[] {
  let corte = -1;
  msgs.forEach((m, i) => {
    if (m.status !== "enviada") return;
    if (m.autor === "equipe") corte = Math.max(corte, i);
    if (m.autor === "iris" && cobreAte(m) !== undefined) {
      const alvo = msgs.findIndex((x) => x.id === cobreAte(m));
      corte = Math.max(corte, alvo >= 0 ? alvo : i);
    }
  });
  return msgs.filter((m, i) => i > corte && m.autor === "paciente" && m.status === "enviada");
}

// Histórico na ordem da conversa: o que ainda está pendente vai para o fim, depois das respostas
// que não o viram (senão o histórico terminaria numa fala da Íris).
export function emOrdemDeResposta(msgs: Mensagem[]): Mensagem[] {
  const pend = new Set(pendentes(msgs).map((m) => m.id));
  return [...msgs.filter((m) => !pend.has(m.id)), ...msgs.filter((m) => pend.has(m.id))];
}

async function carregar(repo: Repo, id: string): Promise<Carregado> {
  const c = await repo.carregar(id);
  if (!c) throw new Error(`conversa ${id} não existe`);
  return c;
}

export async function atender(p: Turno & { texto?: string }): Promise<Desfecho> {
  const { repo, conversaId } = p;
  const inicial = await carregar(repo, conversaId);
  if (inicial.conversa.canal !== "simulador") throw new Error("canal não suportado nesta fase");

  if (p.texto !== undefined) {
    await repo.salvarMensagem(conversaId, { autor: "paciente", texto: p.texto, status: "enviada" });
    // Mensagem nova torna o rascunho anterior obsoleto.
    await repo.descartarRascunhos(conversaId);
  }

  // Sem a trava: quem a segura vai ler a mensagem já gravada.
  let ultima = await secaoTravada(p);
  if (!ultima) return "enfileirada";

  // Uma mensagem pode ter chegado depois do retrato usado (durante a gravação, antes de soltar a trava);
  // a chamada dela recebeu "enfileirada". Repete enquanto houver pendente que nenhuma execução viu.
  for (let extra = 0; extra < MAX_REEXECUCOES && ultima.desfecho !== "enfileirada"; extra++) {
    const vistas = ultima.vistas;
    const naoVista = pendentes((await carregar(repo, conversaId)).mensagens).some((m) => !vistas.has(m.id));
    if (!naoVista) break;
    const outra = await secaoTravada(p);
    if (!outra) break; // outra execução pegou a trava e vai responder
    ultima = outra;
  }
  return ultima.desfecho;
}

// Seção com a trava da conversa. Devolve null se outra execução já a segura; "enfileirada" se perdeu a
// trava no meio (outra execução assumiu e responde). `vistas` = ids do último retrato carregado.
async function secaoTravada(p: Turno): Promise<{ desfecho: Desfecho; vistas: Set<string> } | null> {
  const { repo, conversaId: id, agora } = p;
  let token = await repo.travar(id, TRAVA_SEGUNDOS);
  if (!token) return null;
  let vistas = new Set<string>();
  // Renova antes de cada passo longo; sem renovação a conversa é de outra execução.
  const renovar = async () => (token = await repo.renovar(id, token!, TRAVA_SEGUNDOS)) !== null;
  try {
    for (let rodada = 0; ; rodada++) {
      if (!(await renovar())) return { desfecho: "enfileirada", vistas };
      const c = await carregar(repo, id);
      vistas = new Set(c.mensagens.map((m) => m.id));
      if (pendentes(c.mensagens).length === 0) return { desfecho: "respondida", vistas };

      let conversa = c.conversa;
      if (conversa.estado === "equipe") {
        // A equipe assumiu: a Íris só volta depois de 12h sem mensagem da equipe.
        const desde = conversa.equipe_desde ? new Date(conversa.equipe_desde).getTime() : null;
        if (desde === null || agora.getTime() - desde < PAUSA_EQUIPE_MS) return { desfecho: "equipe", vistas };
        await repo.atualizarConversa(id, { estado: "iris", equipe_desde: null });
        conversa = { ...conversa, estado: "iris", equipe_desde: null };
      }

      await repo.descartarRascunhos(id);
      const hoje = agoraRecife(agora).data;
      const ctx: Ctx = {
        repo, efeitos: efeitosSimulados(repo, id), agora, conversa, config: c.config, manual: c.manual,
      };
      const r = await responder({
        ctx, cliente: p.cliente,
        systemEstavel: montarSystem({ config: c.config, manual: c.manual, promocoes: c.promocoes, hoje }),
        systemContexto: montarContexto({ agora, conversa, pendencias: c.pendencias, reserva: c.reserva, canal: conversa.canal }),
        historico: montarHistorico(emOrdemDeResposta(c.mensagens)),
        autorizados: valoresAutorizados(c.manual, c.promocoes, hoje),
        // Renova antes de cada chamada ao modelo: quem perdeu a trava para sem rodar mais ferramentas.
        antesDeCadaChamada: renovar,
      });
      if (token === null) return { desfecho: "enfileirada", vistas };

      // Rajada: se a paciente escreveu de novo enquanto o modelo pensava, a resposta já está velha.
      // Descarta os textos (notas das ferramentas ficam) e responde de novo com tudo.
      if (rodada < MAX_REPETICOES) {
        const novas = (await carregar(repo, id)).mensagens;
        if (novas.some((m) => m.autor === "paciente" && m.status === "enviada" && !vistas.has(m.id))) continue;
      }
      // Confere a posse logo antes de gravar: quem perdeu a trava não grava nada.
      if (!(await renovar())) return { desfecho: "enfileirada", vistas };
      const viu = c.mensagens.filter((m) => m.autor === "paciente" && m.status === "enviada").at(-1)!;
      return { desfecho: await persistir(repo, id, r, c.config, agora, viu.id), vistas };
    }
  } finally {
    if (token) await repo.destravar(id, token);
  }
}

async function persistir(
  repo: Repo, id: string, r: Resultado, config: IrisConfig, agora: Date, cobre_ate: string,
): Promise<Desfecho> {
  const fora = foraDoExpediente(agora, config.horarios);
  const nota = (meta?: unknown): NovaMensagem => ({ autor: "sistema", texto: NOTAS[r.bloqueio!], status: "enviada", meta });
  // Os textos (e a nota, se houver) num só insert, na ordem; o primeiro texto leva o uso e a cobertura.
  const textos = (status: NovaMensagem["status"], extra: Partial<NovaMensagem> = {}): NovaMensagem[] =>
    r.textos.map((texto, i) => ({ autor: "iris", texto, status, ...extra, meta: i === 0 ? { uso: r.uso, cobre_ate } : undefined }));

  if (r.bloqueio === null) {
    // Supervisionado em horário comercial: a equipe revisa antes. Fora do expediente não há quem
    // revise, então sai direto (marcado como fora do expediente).
    const rascunho = config.modo === "supervisionado" && !fora;
    await repo.salvarMensagens(id, textos(rascunho ? "rascunho" : "enviada", { fora_expediente: fora }));
    return rascunho ? "rascunho" : "respondida";
  }
  if (r.bloqueio === "valor_nao_autorizado") {
    // Valor fora do Manual nunca sai sozinho, em nenhum modo.
    await repo.salvarMensagens(id, [...textos("rascunho"), nota()]);
    return "rascunho";
  }
  // Sem marcador: a mensagem continua pendente e a próxima chamada tenta de novo.
  await repo.salvarMensagem(id, nota({ uso: r.uso }));
  return "bloqueada";
}
