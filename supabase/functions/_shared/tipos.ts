export type Procedimento = "avaliacao" | "limpeza_de_pele";
export type Faixa = { inicio: string; fim: string };
export interface Horarios {
  semana: Record<"1"|"2"|"3"|"4"|"5"|"6", Faixa | null>; // 1=seg … 6=sáb; domingo fechado
  almoco: Faixa;
  excecoes: { data: string; tipo: "extra" | "bloqueio"; inicio: string; fim: string }[];
}
export interface Slot { data: string; hora: string; fim: string }
export interface Ocupado { data: string; inicio: string; fim: string | null; procedimento: string | null }
export interface IrisConfig {
  modo: "supervisionado" | "automatico"; horarios: Horarios;
  endereco: string; como_chegar: string; formas_pagamento: string;
  politica_cancelamento: string; politica_atraso: string; nunca_dizer: string; frase_emergencia: string;
}
export interface ItemManual {
  chave: string; nome: string; o_que_e: string; indicacao: string; preparo: string; cuidados: string;
  informa_preco: boolean; preco_texto: string; duracao_min: number | null;
  agenda_direto: boolean; sinal_centavos: number | null; aprovado: boolean;
}
export interface Promocao { procedimento_chave: string; descricao: string; valido_ate: string }
export interface Conversa {
  id: string; user_id: string; canal: "simulador" | "whatsapp"; contato_nome: string;
  estado: "iris" | "equipe"; equipe_desde: string | null; qualificacao: Record<string, string>;
}
export interface Mensagem {
  id: string; autor: "paciente" | "iris" | "equipe" | "sistema"; texto: string;
  status: "rascunho" | "enviada" | "descartada"; created_at: string;
}
export interface Pendencia { id: string; motivo: string; resumo: string; urgente: boolean; status: "aberta" | "resolvida" }
export interface Reserva {
  id: string; conversa_id: string; procedimento: Procedimento; data: string; hora_inicio: string; hora_fim: string;
  valor_centavos: number; status: "ativa" | "paga" | "expirada" | "cancelada"; teste: boolean; expira_em: string;
}
export interface Efeitos {
  etiquetar(nome: string): Promise<void>;
  moverCard(status: string): Promise<void>;
  criarAgendamento(a: { procedimento: string; data: string; inicio: string; fim: string }): Promise<void>;
  avisarDraUrgente(resumo: string): Promise<void>;
}
