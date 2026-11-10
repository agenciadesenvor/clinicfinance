// Montagem do prompt: bloco estável (cacheável), bloco volátil e histórico só com texto.
import type { Conversa, IrisConfig, ItemManual, Mensagem, Pendencia, Promocao, Reserva } from "./tipos.ts";
import { KIT } from "./kit.ts";
import { agoraRecife, rotuloSlot } from "./horarios.ts";

const NAO_INFORMADO = "(ainda não informado — se perguntarem, diga que vai confirmar com a equipe)";
const NAO_APROVADO = "Conteúdo ainda não aprovado pela Dra.: qualquer pergunta sobre este procedimento vai para a Dra.";
const MAX_HISTORICO = 60;
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const CAMPOS_PRATICOS: [keyof IrisConfig, string][] = [
  ["endereco", "Endereço"],
  ["como_chegar", "Como chegar"],
  ["formas_pagamento", "Formas de pagamento"],
  ["politica_cancelamento", "Política de cancelamento"],
  ["politica_atraso", "Política de atraso"],
  ["nunca_dizer", "O que a Dra. pediu para nunca dizer"],
  ["frase_emergencia", "Frase para sinais graves"],
];

const ROTULO_QUALIFICACAO: Record<string, string> = {
  nome: "Nome completo",
  quer_melhorar: "O que quer melhorar",
  ja_fez: "Já fez procedimento",
  momento: "Momento (agora ou pesquisando)",
  origem: "De onde veio",
};

const PROCEDIMENTO_RESERVA: Record<Reserva["procedimento"], string> = {
  avaliacao: "avaliação",
  limpeza_de_pele: "limpeza de pele",
};

const porTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function reais(centavos: number): string {
  const [int, dec] = (centavos / 100).toFixed(2).split(".");
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function blocoItem(it: ItemManual): string {
  const linhas = [`### ${it.nome} (${it.chave})`];
  linhas.push(
    it.informa_preco && it.preco_texto.trim()
      ? `Preço que você pode informar: ${it.preco_texto.trim()}`
      : 'Preço: não informar. Diga que "o valor é definido na avaliação".',
  );
  linhas.push(`Tempo na agenda: ${it.duracao_min != null ? `${it.duracao_min} min` : "não definido"}`);
  linhas.push(
    it.agenda_direto
      ? "Agendamento: você agenda direto."
      : "Agendamento: só depois da avaliação, e quem agenda é a clínica.",
  );
  linhas.push(`Sinal para reservar: ${it.sinal_centavos != null ? reais(it.sinal_centavos) : "não há"}`);
  if (it.aprovado) {
    const textos: [string, string][] = [
      ["O que é", it.o_que_e], ["Para quem é indicado", it.indicacao], ["Preparo", it.preparo], ["Cuidados depois", it.cuidados],
    ];
    for (const [rotulo, texto] of textos) if (texto?.trim()) linhas.push(`${rotulo}: ${texto.trim()}`);
  } else {
    linhas.push(NAO_APROVADO);
  }
  return linhas.join("\n");
}

export function montarSystem(p: { config: IrisConfig; manual: ItemManual[]; promocoes: Promocao[]; hoje: string }): string {
  const praticas = CAMPOS_PRATICOS.map(([campo, rotulo]) => {
    const v = String(p.config[campo] ?? "").trim();
    return `${rotulo}: ${v || NAO_INFORMADO}`;
  }).join("\n");

  const manual = [...p.manual].sort((a, b) => porTexto(a.chave, b.chave));
  const nomes = new Map(manual.map((it) => [it.chave, it.nome]));

  const validas = p.promocoes
    .filter((pr) => pr.valido_ate >= p.hoje)
    .sort((a, b) =>
      porTexto(a.procedimento_chave, b.procedimento_chave) || porTexto(a.valido_ate, b.valido_ate) ||
      porTexto(a.descricao, b.descricao)
    );
  const promocoes = validas.length
    ? validas.map((pr) =>
      `- ${nomes.get(pr.procedimento_chave) ?? pr.procedimento_chave}: ${pr.descricao.trim()} (válida até ${dataBr(pr.valido_ate)})`
    ).join("\n")
    : "Nenhuma promoção ativa no momento.";

  return [
    KIT.trimEnd(),
    `# Informações práticas\n\n${praticas}`,
    `# Manual\n\n${manual.length ? manual.map(blocoItem).join("\n\n") : "Nenhum procedimento cadastrado."}`,
    `# Promoções válidas\n\n${promocoes}`,
  ].join("\n\n");
}

export function montarContexto(
  p: { agora: Date; conversa: Conversa; pendencias: Pendencia[]; reserva: Reserva | null; canal: string },
): string {
  const { data, hora, diaSemana } = agoraRecife(p.agora);
  const linhas = [
    "# Contexto desta conversa",
    "",
    `Agora em Recife: ${DIAS[diaSemana]}, ${dataBr(data)}, ${hora}.`,
    `Canal: ${p.canal}.`,
    `Nome do contato: ${p.conversa.contato_nome?.trim() || "não informado"}.`,
  ];

  const q = p.conversa.qualificacao ?? {};
  const chaves = [
    ...Object.keys(ROTULO_QUALIFICACAO).filter((k) => q[k]?.trim()),
    ...Object.keys(q).filter((k) => !(k in ROTULO_QUALIFICACAO) && q[k]?.trim()).sort(porTexto),
  ];
  linhas.push(
    chaves.length
      ? `O que já sabemos da paciente: ${chaves.map((k) => `${ROTULO_QUALIFICACAO[k] ?? k}: ${q[k].trim()}`).join("; ")}.`
      : "O que já sabemos da paciente: nada registrado ainda.",
  );

  const abertas = p.pendencias.filter((x) => x.status === "aberta");
  linhas.push(
    abertas.length
      ? `A Dra. ainda vai responder sobre: ${abertas.map((x) => x.resumo.trim() + (x.urgente ? " (urgente)" : "")).join("; ")}.`
      : "Nenhum assunto aguardando a Dra.",
  );

  if (p.reserva) {
    const r = p.reserva;
    const rotulo = rotuloSlot({ data: r.data, hora: r.hora_inicio, fim: r.hora_fim });
    const resto = Math.max(0, Math.floor((new Date(r.expira_em).getTime() - p.agora.getTime()) / 60_000));
    const proc = PROCEDIMENTO_RESERVA[r.procedimento] ?? r.procedimento;
    linhas.push(
      r.status === "ativa"
        ? `Reserva ativa: ${proc}, ${rotulo}, ${reais(r.valor_centavos)}, aguardando pagamento; o horário fica segurado por mais ${resto} min.`
        : `Reserva: ${proc}, ${rotulo}, situação: ${r.status}.`,
    );
  } else {
    linhas.push("Nenhuma reserva ativa.");
  }
  return linhas.join("\n");
}

export function montarHistorico(msgs: Mensagem[]): { role: "user" | "assistant"; content: string }[] {
  const validas = msgs.filter((m) => m.status === "enviada" && m.autor !== "sistema").slice(-MAX_HISTORICO);
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of validas) {
    const role = m.autor === "paciente" ? "user" : "assistant";
    const content = m.autor === "equipe" ? `(a equipe escreveu) ${m.texto}` : m.texto;
    const ult = out.at(-1);
    if (ult && ult.role === role) ult.content += `\n\n${content}`;
    else out.push({ role, content });
  }
  if (out[0]?.role === "assistant") out.unshift({ role: "user", content: "(início da conversa)" });
  return out;
}
