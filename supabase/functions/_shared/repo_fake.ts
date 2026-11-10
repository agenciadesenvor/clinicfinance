// Repo em memória para os testes. Espelha as regras de iris_segurar_horario.
import { duracaoOcupado } from "./horarios.ts";
import type { Carregado, NovaMensagem, Repo } from "./repo.ts";
import type {
  Conversa, IrisConfig, ItemManual, Mensagem, Ocupado, Pendencia, Procedimento, Promocao, Reserva, Slot,
} from "./tipos.ts";

const paraMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const deMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// Mensagem como fica gravada: os testes conferem também fora_expediente e meta.
export type MensagemFake = Mensagem & { fora_expediente: boolean; meta: unknown };

export interface InicialFake {
  conversa?: Partial<Conversa>; config?: Partial<IrisConfig>; manual?: ItemManual[]; promocoes?: Promocao[]; agora?: Date;
}

export function criarRepoFake(inicial: InicialFake = {}) {
  const estado = {
    agora: inicial.agora ?? new Date("2026-11-13T01:30:00Z"),
    conversa: {
      id: "conversa-1", user_id: "user-1", canal: "simulador", contato_nome: "Camila", estado: "iris",
      equipe_desde: null, qualificacao: {}, ...inicial.conversa,
    } as Conversa,
    config: {
      modo: "supervisionado",
      horarios: {
        semana: {
          "1": { inicio: "09:00", fim: "18:00" }, "2": { inicio: "09:00", fim: "18:00" },
          "3": { inicio: "09:00", fim: "18:00" }, "4": { inicio: "09:00", fim: "18:00" },
          "5": { inicio: "09:00", fim: "18:00" }, "6": { inicio: "09:00", fim: "12:00" },
        },
        almoco: { inicio: "12:00", fim: "13:00" }, excecoes: [],
      },
      endereco: "", como_chegar: "", formas_pagamento: "", politica_cancelamento: "", politica_atraso: "",
      nunca_dizer: "", frase_emergencia: "", ...inicial.config,
    } as IrisConfig,
    manual: inicial.manual ?? ([] as ItemManual[]),
    promocoes: inicial.promocoes ?? ([] as Promocao[]),
    mensagens: [] as MensagemFake[],
    pendencias: [] as Pendencia[],
    reservas: [] as Reserva[],
    agendamentos: [] as Ocupado[],
    processandoAte: null as number | null,
    recusar: false,
    seq: 0,
  };

  const repo: Repo = {
    carregar(id) {
      if (id !== estado.conversa.id) return Promise.resolve(null);
      const reserva = estado.reservas.find((r) =>
        r.conversa_id === id && r.status === "ativa" && new Date(r.expira_em) > fake.agora
      ) ?? null;
      const c: Carregado = {
        conversa: estado.conversa, config: estado.config, manual: estado.manual, promocoes: estado.promocoes,
        mensagens: [...estado.mensagens], pendencias: estado.pendencias.filter((p) => p.status === "aberta"),
        reserva,
      };
      return Promise.resolve(c);
    },

    ocupados(_userId, de, ate, opts) {
      const out: Ocupado[] = estado.agendamentos.filter((a) => a.data >= de && a.data <= ate);
      for (const r of estado.reservas) {
        if (r.data < de || r.data > ate) continue;
        if (r.teste && !opts.incluirTestes) continue;
        if (r.status === "ativa") {
          if (new Date(r.expira_em) <= fake.agora) continue;
          if (opts.excetoConversaId && r.conversa_id === opts.excetoConversaId) continue;
        } else if (r.status !== "paga") continue;
        out.push({ data: r.data, inicio: r.hora_inicio, fim: r.hora_fim, procedimento: r.procedimento });
      }
      return Promise.resolve(out);
    },

    segurar(conversaId, proc: Procedimento, s: Slot, valorCentavos) {
      if (estado.recusar) { estado.recusar = false; return Promise.resolve(null); }
      if (s.fim <= s.hora || conversaId !== estado.conversa.id) return Promise.resolve(null);
      const teste = estado.conversa.canal === "simulador";
      const bate = (ini: string, fim: string) => ini < s.fim && fim > s.hora;
      for (const a of estado.agendamentos) {
        if (a.data !== s.data) continue;
        if (bate(a.inicio, a.fim ?? deMin(paraMin(a.inicio) + duracaoOcupado(a)))) return Promise.resolve(null);
      }
      for (const r of estado.reservas) {
        if (r.data !== s.data) continue;
        const vale = r.status === "paga" || (r.status === "ativa" && new Date(r.expira_em) > fake.agora);
        if (!vale) continue;
        if (r.conversa_id === conversaId && r.status !== "paga") continue;
        if (r.teste && !teste) continue;
        if (bate(r.hora_inicio, r.hora_fim)) return Promise.resolve(null);
      }
      for (const r of estado.reservas) if (r.conversa_id === conversaId && r.status === "ativa") r.status = "cancelada";
      const nova: Reserva = {
        id: `reserva-${++estado.seq}`, conversa_id: conversaId, procedimento: proc, data: s.data,
        hora_inicio: s.hora, hora_fim: s.fim, valor_centavos: valorCentavos, status: "ativa", teste,
        expira_em: new Date(fake.agora.getTime() + 30 * 60_000).toISOString(),
      };
      estado.reservas.push(nova);
      return Promise.resolve(nova);
    },

    salvarMensagem(_id, m: NovaMensagem) {
      const n = estado.mensagens.length + 1;
      const msg: MensagemFake = {
        id: `msg-${n}`, autor: m.autor, texto: m.texto, status: m.status,
        created_at: new Date(fake.agora.getTime() + n).toISOString(), // estritamente crescente
        fora_expediente: m.fora_expediente ?? false, meta: m.meta ?? {},
      };
      estado.mensagens.push(msg);
      return Promise.resolve(msg.id);
    },

    descartarRascunhos() {
      for (const m of estado.mensagens) if (m.status === "rascunho") m.status = "descartada";
      return Promise.resolve();
    },

    atualizarConversa(_id, campos) {
      Object.assign(estado.conversa, campos);
      return Promise.resolve();
    },

    abrirPendencia(_id, p) {
      estado.pendencias.push({ id: `pend-${estado.pendencias.length + 1}`, ...p, status: "aberta" });
      return Promise.resolve();
    },

    travar(_id, segundos) {
      const t = fake.agora.getTime();
      if (estado.processandoAte !== null && estado.processandoAte >= t) return Promise.resolve(false);
      estado.processandoAte = t + segundos * 1000;
      return Promise.resolve(true);
    },

    destravar() { estado.processandoAte = null; return Promise.resolve(); },

    reserva(id) { return Promise.resolve(estado.reservas.find((r) => r.id === id) ?? null); },

    marcarReserva(id, status) {
      const r = estado.reservas.find((x) => x.id === id);
      if (r) r.status = status;
      return Promise.resolve();
    },
  };

  // Objeto exposto: o Repo mais os arrays e controles que os testes usam.
  const fake = {
    ...repo,
    get agora() { return estado.agora; },
    set agora(d: Date) { estado.agora = d; },
    get conversa() { return estado.conversa; },
    get config() { return estado.config; },
    get manual() { return estado.manual; },
    get promocoes() { return estado.promocoes; },
    mensagens: estado.mensagens,
    pendencias: estado.pendencias,
    reservas: estado.reservas,
    ocupar(o: Ocupado) { estado.agendamentos.push(o); },
    recusarProximaReserva() { estado.recusar = true; },
  };
  return fake;
}
export type RepoFake = ReturnType<typeof criarRepoFake>;
