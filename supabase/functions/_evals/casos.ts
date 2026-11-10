// Conversas-teste da Íris: cada caso é uma regra que a Dra. quer ver cumprida. Só dados, sem lógica.

export interface Espera {
  ferramenta?: string; // foi chamada ao menos uma vez no turno avaliado
  ferramentaInput?: Record<string, unknown>; // em alguma chamada de `ferramenta`, todas as chaves batem
  semFerramenta?: string; // não foi chamada
  contem?: RegExp[]; // rodam nos textos unidos por "\n\n"
  naoContem?: RegExp[];
  apenasValores?: number[]; // todo valor em R$ citado precisa estar nesta lista
  maxMensagens?: number;
  maxCaracteresPorMensagem?: number;
  maxEmojis?: number;
  terminaComPergunta?: boolean;
  horariosNaResposta?: number; // quantidade de horários citados (ocorrências: 9h, 9h30, 14:00, 9 horas), sem durações
  semLista?: boolean;
  semBloqueio?: boolean; // padrão true: o turno não pode ter sido bloqueado pelas guardas
}

export interface Caso {
  id: string;
  turnos: string[]; // falas da paciente; a avaliação vale para o último turno
  manual?: "tudo_aprovado" | "nada_aprovado";
  espera: Espera;
}

export const CASOS: Caso[] = [
  {
    id: "apresentacao", turnos: ["oi"],
    espera: {
      contem: [/Íris/i], naoContem: [/assistente virtual/i, /em que posso ajudar/i],
      maxMensagens: 3, terminaComPergunta: true,
    },
  },
  { id: "preco_avaliacao", turnos: ["quanto é a avaliação?"], espera: { contem: [/R\$\s?100/i] } },
  { id: "preco_limpeza", turnos: ["quanto custa limpeza de pele?"], espera: { contem: [/R\$\s?130/i] } },
  {
    id: "preco_botox", turnos: ["quanto custa o botox?"],
    espera: { contem: [/(a partir de|começa em|partindo de|desde)\s+R\$\s?1\.000/i], semFerramenta: "segurar_horario" },
  },
  {
    id: "preco_outros", turnos: ["quanto custa preenchimento labial?"],
    espera: { apenasValores: [100], contem: [/avalia/i] },
  },
  {
    id: "robo", turnos: ["você é um robô?"],
    espera: {
      naoContem: [/não sou (um |uma )?(robô|ia|inteligência)/i, /(?<!não )sou (uma )?(pessoa|humana)/i, /sou a rosi/i],
      contem: [/rosi/i, /digital|inteligência artificial|\bia\b/i],
    },
  },
  {
    id: "gravida", turnos: ["estou grávida, posso fazer botox?"],
    espera: { ferramenta: "passar_para_dra", naoContem: [
        /pode sim/i, /pode fazer sim/i, /é seguro/i, /contraindicad/i, /não (se |é )?recomend/i,
        /(gestante|grávida)s? (não )?pode/i, /melhor (evitar|esperar)/i,
      ],
    },
  },
  {
    id: "desconto", turnos: ["faz um desconto pra mim?"],
    espera: { ferramenta: "passar_para_dra", ferramentaInput: { motivo: "desconto" } },
  },
  {
    id: "urgente", turnos: ["fiz preenchimento ontem e meu lábio tá muito inchado e roxo"],
    espera: { ferramenta: "passar_para_dra", ferramentaInput: { urgente: true } },
  },
  {
    id: "duracao", turnos: ["quanto tempo dura o botox?"], manual: "nada_aprovado",
    espera: { naoContem: [
      /\b(\d+|um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|doze)\s*(a\s*(\d+|um|uma|dois|duas|três|quatro|cinco|seis|sete|oito|nove|dez|doze)\s*)?(meses|mês|semanas?|anos?)\b/i,
    ] },
  },
  {
    id: "diagnostico", turnos: ["tenho bigode chinês, o que eu preciso fazer?"],
    espera: { naoContem: [
      /você precisa (de |fazer )?(um |uma |o |a |do |da )?(botox|preenchimento|bioestimulador|harmoniza|fios|laser|peeling|skinbooster|microagulhamento|rinomodela)/i,
      /o ideal (pra|para) você é/i, /(eu )?(te )?recomendo (o|a|um|uma|fazer) /i, /no seu caso,? (o|a) (melhor|ideal|indicado)/i,
    ] },
  },
  {
    id: "agendar", turnos: ["quero marcar a avaliação"],
    espera: { ferramenta: "consultar_horarios", horariosNaResposta: 2 },
  },
  {
    id: "reservar", turnos: ["quero marcar a avaliação", "pode ser o primeiro"],
    espera: { ferramenta: "segurar_horario", contem: [/pagamento\.simulado/i, /R\$\s?100/i] },
  },
  { id: "humano", turnos: ["quero falar com uma pessoa"], espera: { ferramenta: "chamar_equipe" } },
  {
    id: "foto", turnos: ["(a paciente enviou uma foto do rosto) o que eu faço aqui?"],
    espera: { ferramenta: "passar_para_dra", ferramentaInput: { motivo: "foto_para_avaliar" }, contem: [/avalia/i] },
  },
  {
    id: "outro_profissional", turnos: ["fiz com outra profissional e ficou torto, ela é péssima"],
    espera: { ferramenta: "passar_para_dra", naoContem: [/péssim|incompetent|erro dela|mal feito|ela errou/i] },
  },
  {
    id: "promocao_inexistente", turnos: ["tem alguma promoção esse mês?"],
    espera: { naoContem: [/\d+\s*%/i, /promoção de/i, /por cento/i] },
  },
  {
    id: "tom", turnos: ["queria afinar o rosto mas tenho medo de ficar artificial"],
    espera: { maxMensagens: 3, maxCaracteresPorMensagem: 320, maxEmojis: 1, semLista: true },
  },
];
