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

const TRAVA_SEGUNDOS = 120;
const MAX_REPETICOES = 2; // rajada: até 3 chamadas ao modelo no mesmo turno
const PAUSA_EQUIPE_MS = 12 * 3600_000;

const NOTAS: Record<Bloqueio, string> = {
  erro_api: "A Íris não conseguiu responder (falha técnica). Responda você ou peça para ela tentar de novo.",
  recusa: "A Íris não conseguiu concluir esta resposta. Responda você.",
  limite_iteracoes: "A Íris não conseguiu concluir esta resposta. Responda você.",
  resposta_cortada: "A Íris não conseguiu concluir esta resposta. Responda você.",
  valor_nao_autorizado: "A Íris citou um valor que não está no Manual. Confira antes de enviar.",
};

// A conversa espera resposta quando a última mensagem enviada (sem contar notas) é da paciente.
function pendente(msgs: Mensagem[]): Mensagem | null {
  const ult = msgs.filter((m) => m.status === "enviada" && m.autor !== "sistema").at(-1);
  return ult?.autor === "paciente" ? ult : null;
}
const chegouNova = (msgs: Mensagem[], vistas: Set<string>) =>
  msgs.some((m) => m.autor === "paciente" && m.status === "enviada" && !vistas.has(m.id));

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

  const primeira = await secaoTravada(p);
  // Sem a trava: quem a segura vai ler a mensagem já gravada.
  if (!primeira) return "enfileirada";

  // Uma mensagem pode ter chegado entre a conferência de rajada e a liberação da trava; a chamada
  // dela recebeu "enfileirada" e ninguém mais a responderia. Reconfere uma vez.
  const depois = await carregar(repo, conversaId);
  const nova = pendente(depois.mensagens);
  if (nova && !primeira.vistas.has(nova.id)) {
    const segunda = await secaoTravada(p);
    if (segunda) return segunda.desfecho;
  }
  return primeira.desfecho;
}

// Seção com a trava da conversa. Devolve null se outra execução já a segura.
// `vistas` são os ids das mensagens do retrato usado na decisão/resposta.
async function secaoTravada(p: Turno): Promise<{ desfecho: Desfecho; vistas: Set<string> } | null> {
  const { repo, conversaId: id, agora } = p;
  if (!(await repo.travar(id, TRAVA_SEGUNDOS))) return null;
  try {
    for (let rodada = 0; ; rodada++) {
      const c = await carregar(repo, id);
      const vistas = new Set(c.mensagens.map((m) => m.id));
      if (!pendente(c.mensagens)) return { desfecho: "respondida", vistas };

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
        historico: montarHistorico(c.mensagens),
        autorizados: valoresAutorizados(c.manual, c.promocoes, hoje),
      });

      // Rajada: se a paciente escreveu de novo enquanto o modelo pensava, a resposta já está velha.
      // Descarta os textos (notas das ferramentas ficam) e responde de novo com tudo.
      if (rodada < MAX_REPETICOES && chegouNova((await carregar(repo, id)).mensagens, vistas)) continue;

      return { desfecho: await persistir(repo, id, r, c.config, agora), vistas };
    }
  } finally {
    await repo.destravar(id);
  }
}

async function persistir(repo: Repo, id: string, r: Resultado, config: IrisConfig, agora: Date): Promise<Desfecho> {
  const fora = foraDoExpediente(agora, config.horarios);
  let meta: unknown = { uso: r.uso }; // só na primeira mensagem do turno
  const salvar = async (m: NovaMensagem) => {
    await repo.salvarMensagem(id, { ...m, meta });
    meta = undefined;
  };
  const nota = () => salvar({ autor: "sistema", texto: NOTAS[r.bloqueio!], status: "enviada" });

  if (r.bloqueio === null) {
    // Supervisionado em horário comercial: a equipe revisa antes. Fora do expediente não há quem
    // revise, então sai direto (marcado como fora do expediente).
    const rascunho = config.modo === "supervisionado" && !fora;
    for (const t of r.textos) {
      await salvar({ autor: "iris", texto: t, status: rascunho ? "rascunho" : "enviada", fora_expediente: fora });
    }
    return rascunho ? "rascunho" : "respondida";
  }
  if (r.bloqueio === "valor_nao_autorizado") {
    // Valor fora do Manual nunca sai sozinho, em nenhum modo.
    for (const t of r.textos) await salvar({ autor: "iris", texto: t, status: "rascunho" });
    await nota();
    return "rascunho";
  }
  await nota();
  return "bloqueada";
}
