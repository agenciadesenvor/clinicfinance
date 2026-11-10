// Acesso a dados da Íris. A interface é usada pelas ferramentas e pelo orquestrador;
// repo_fake.ts a implementa em memória para os testes.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Conversa, IrisConfig, ItemManual, Mensagem, Ocupado, Pendencia, Procedimento, Promocao, Reserva, Slot,
} from "./tipos.ts";

export interface Carregado {
  conversa: Conversa; config: IrisConfig; manual: ItemManual[]; promocoes: Promocao[];
  mensagens: Mensagem[]; pendencias: Pendencia[]; reserva: Reserva | null; // reserva = ativa e não expirada
}
export interface NovaMensagem {
  autor: Mensagem["autor"]; texto: string; status: Mensagem["status"]; fora_expediente?: boolean; meta?: unknown;
}
export interface OpcoesOcupados { incluirTestes: boolean; excetoConversaId?: string }

export interface Repo {
  carregar(conversaId: string): Promise<Carregado | null>;
  // agendamentos não cancelados + reservas pagas ou ativas não expiradas (espelha iris_segurar_horario)
  ocupados(userId: string, de: string, ate: string, opts: OpcoesOcupados): Promise<Ocupado[]>;
  segurar(conversaId: string, proc: Procedimento, s: Slot, valorCentavos: number): Promise<Reserva | null>;
  salvarMensagem(conversaId: string, m: NovaMensagem): Promise<string>;
  descartarRascunhos(conversaId: string): Promise<void>;
  atualizarConversa(
    conversaId: string, campos: Partial<Pick<Conversa, "estado" | "equipe_desde" | "qualificacao">>,
  ): Promise<void>;
  abrirPendencia(conversaId: string, p: { motivo: string; resumo: string; urgente: boolean }): Promise<void>;
  travar(conversaId: string, segundos: number): Promise<boolean>;
  destravar(conversaId: string): Promise<void>;
  reserva(id: string): Promise<Reserva | null>;
  marcarReserva(id: string, status: Reserva["status"]): Promise<void>;
}

// Padrões de iris.sql para quem ainda não tem linha em iris_config.
const HORARIOS_PADRAO: IrisConfig["horarios"] = {
  semana: {
    "1": { inicio: "09:00", fim: "18:00" }, "2": { inicio: "09:00", fim: "18:00" },
    "3": { inicio: "09:00", fim: "18:00" }, "4": { inicio: "09:00", fim: "18:00" },
    "5": { inicio: "09:00", fim: "18:00" }, "6": { inicio: "09:00", fim: "12:00" },
  },
  almoco: { inicio: "12:00", fim: "13:00" },
  excecoes: [],
};
const CONFIG_PADRAO: IrisConfig = {
  modo: "supervisionado", horarios: HORARIOS_PADRAO, endereco: "", como_chegar: "", formas_pagamento: "",
  politica_cancelamento: "", politica_atraso: "", nunca_dizer: "", frase_emergencia: "",
};

const hhmm = (t: string) => t.slice(0, 5);
const somaMin = (t: string, min: number) => {
  const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + min;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

// Lança em erro do Supabase; devolve as linhas sem tipar (o cliente aqui não tem o schema gerado).
// deno-lint-ignore no-explicit-any
function ler(r: { data: unknown; error: { message: string } | null }, onde: string): any {
  if (r.error) throw new Error(`${onde}: ${r.error.message}`);
  return r.data;
}

function paraReserva(l: Linha): Reserva {
  return {
    id: l.id, conversa_id: l.conversa_id, procedimento: l.procedimento, data: l.data,
    hora_inicio: hhmm(l.hora_inicio), hora_fim: hhmm(l.hora_fim), valor_centavos: l.valor_centavos,
    status: l.status, teste: !!l.teste, expira_em: l.expira_em,
  };
}

export function repoSupabase(db: SupabaseClient): Repo {
  // Todo write precisa do user_id da conversa (as tabelas filhas exigem).
  async function donoDe(conversaId: string): Promise<string> {
    const l = ler(await db.from("iris_conversas").select("user_id").eq("id", conversaId).maybeSingle(), "conversa");
    if (!l) throw new Error(`conversa ${conversaId} não existe`);
    return l.user_id;
  }

  return {
    async carregar(conversaId) {
      const c = ler(await db.from("iris_conversas").select("*").eq("id", conversaId).maybeSingle(), "conversa");
      if (!c) return null;
      const agora = new Date().toISOString();
      const [cfg, man, pro, men, pen, res] = await Promise.all([
        db.from("iris_config").select("*").eq("user_id", c.user_id).maybeSingle(),
        db.from("iris_manual").select("*").eq("user_id", c.user_id).order("ordem", { ascending: true }),
        db.from("iris_promocoes").select("*").eq("user_id", c.user_id),
        db.from("iris_mensagens").select("*").eq("conversa_id", conversaId).order("created_at", { ascending: true }),
        db.from("iris_pendencias").select("*").eq("conversa_id", conversaId).eq("status", "aberta")
          .order("created_at", { ascending: true }),
        db.from("iris_reservas").select("*").eq("conversa_id", conversaId).eq("status", "ativa").gt("expira_em", agora)
          .order("created_at", { ascending: false }).limit(1),
      ]);
      const cl = ler(cfg, "config");
      const config: IrisConfig = cl ? {
        modo: cl.modo, horarios: cl.horarios ?? HORARIOS_PADRAO, endereco: cl.endereco ?? "",
        como_chegar: cl.como_chegar ?? "", formas_pagamento: cl.formas_pagamento ?? "",
        politica_cancelamento: cl.politica_cancelamento ?? "", politica_atraso: cl.politica_atraso ?? "",
        nunca_dizer: cl.nunca_dizer ?? "", frase_emergencia: cl.frase_emergencia ?? "",
      } : CONFIG_PADRAO;
      const reservas = ler(res, "reservas") ?? [];
      return {
        conversa: {
          id: c.id, user_id: c.user_id, canal: c.canal, contato_nome: c.contato_nome ?? "",
          estado: c.estado ?? "iris", equipe_desde: c.equipe_desde ?? null, qualificacao: c.qualificacao ?? {},
        },
        config,
        manual: (ler(man, "manual") ?? []).map((m: Linha): ItemManual => ({
          chave: m.chave, nome: m.nome ?? "", o_que_e: m.o_que_e ?? "", indicacao: m.indicacao ?? "",
          preparo: m.preparo ?? "", cuidados: m.cuidados ?? "", informa_preco: !!m.informa_preco,
          preco_texto: m.preco_texto ?? "", duracao_min: m.duracao_min ?? null, agenda_direto: !!m.agenda_direto,
          sinal_centavos: m.sinal_centavos ?? null, aprovado: !!m.aprovado,
        })),
        promocoes: (ler(pro, "promocoes") ?? []).map((p: Linha): Promocao => ({
          procedimento_chave: p.procedimento_chave ?? "", descricao: p.descricao, valido_ate: p.valido_ate,
        })),
        mensagens: (ler(men, "mensagens") ?? []).map((m: Linha): Mensagem => ({
          id: m.id, autor: m.autor, texto: m.texto, status: m.status, created_at: m.created_at,
        })),
        pendencias: (ler(pen, "pendencias") ?? []).map((p: Linha): Pendencia => ({
          id: p.id, motivo: p.motivo ?? "", resumo: p.resumo ?? "", urgente: !!p.urgente, status: p.status,
        })),
        reserva: reservas[0] ? paraReserva(reservas[0]) : null,
      };
    },

    async ocupados(userId, de, ate, opts) {
      const [ag, rs] = await Promise.all([
        db.from("agendamentos").select("data, hora_inicio, hora_fim, procedimento, status")
          .eq("user_id", userId).gte("data", de).lte("data", ate),
        db.from("iris_reservas").select("data, hora_inicio, hora_fim, procedimento, status, expira_em, teste, conversa_id")
          .eq("user_id", userId).gte("data", de).lte("data", ate).in("status", ["paga", "ativa"]),
      ]);
      const agora = Date.now();
      const out: Ocupado[] = [];
      // status nulo também ocupa; só 'cancelado' libera
      for (const a of ler(ag, "agendamentos") ?? []) {
        if (a.status === "cancelado") continue;
        out.push({ data: a.data, inicio: hhmm(a.hora_inicio), fim: a.hora_fim ? hhmm(a.hora_fim) : null, procedimento: a.procedimento ?? null });
      }
      for (const r of ler(rs, "reservas") ?? []) {
        if (r.teste && !opts.incluirTestes) continue;
        if (r.status === "ativa") {
          if (new Date(r.expira_em).getTime() <= agora) continue;
          if (opts.excetoConversaId && r.conversa_id === opts.excetoConversaId) continue;
        }
        out.push({ data: r.data, inicio: hhmm(r.hora_inicio), fim: hhmm(r.hora_fim), procedimento: r.procedimento ?? null });
      }
      return out;
    },

    async segurar(conversaId, proc, s, valorCentavos) {
      const id = ler(
        await db.rpc("iris_segurar_horario", {
          p_conversa: conversaId, p_procedimento: proc, p_data: s.data, p_inicio: s.hora, p_fim: s.fim, p_valor: valorCentavos,
        }),
        "iris_segurar_horario",
      );
      if (!id) return null;
      const l = ler(await db.from("iris_reservas").select("*").eq("id", id).single(), "reserva");
      return l ? paraReserva(l) : null;
    },

    async salvarMensagem(conversaId, m) {
      const user_id = await donoDe(conversaId);
      const l = ler(
        await db.from("iris_mensagens").insert({
          user_id, conversa_id: conversaId, autor: m.autor, texto: m.texto, status: m.status,
          fora_expediente: m.fora_expediente ?? false, meta: m.meta ?? {},
        }).select("id").single(),
        "salvar mensagem",
      );
      ler(await db.from("iris_conversas").update({ ultima_em: new Date().toISOString() }).eq("id", conversaId), "ultima_em");
      return l!.id;
    },

    async descartarRascunhos(conversaId) {
      ler(
        await db.from("iris_mensagens").update({ status: "descartada" }).eq("conversa_id", conversaId).eq("status", "rascunho"),
        "descartar rascunhos",
      );
    },

    async atualizarConversa(conversaId, campos) {
      ler(await db.from("iris_conversas").update(campos).eq("id", conversaId), "atualizar conversa");
    },

    async abrirPendencia(conversaId, p) {
      const user_id = await donoDe(conversaId);
      ler(
        await db.from("iris_pendencias").insert({
          user_id, conversa_id: conversaId, motivo: p.motivo, resumo: p.resumo, urgente: p.urgente, status: "aberta",
        }),
        "abrir pendência",
      );
    },

    async travar(conversaId, segundos) {
      const agora = new Date();
      const ate = new Date(agora.getTime() + segundos * 1000).toISOString();
      const linhas = ler(
        await db.from("iris_conversas").update({ processando_ate: ate }).eq("id", conversaId)
          .or(`processando_ate.is.null,processando_ate.lt.${agora.toISOString()}`).select("id"),
        "travar",
      );
      return (linhas?.length ?? 0) > 0;
    },

    async destravar(conversaId) {
      ler(await db.from("iris_conversas").update({ processando_ate: null }).eq("id", conversaId), "destravar");
    },

    async reserva(id) {
      const l = ler(await db.from("iris_reservas").select("*").eq("id", id).maybeSingle(), "reserva");
      return l ? paraReserva(l) : null;
    },

    async marcarReserva(id, status) {
      ler(await db.from("iris_reservas").update({ status }).eq("id", id), "marcar reserva");
    },
  };
}
