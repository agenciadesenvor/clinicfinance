// Cliente falso para validar o executor sem chamar a API: roteiros de respostas por caso.
// "bom" deve passar em todas as conferências; "ruim" quebra uma regra de propósito.
import type { ClienteClaude } from "../_shared/cerebro.ts";

// deno-lint-ignore no-explicit-any
type Resp = any;
const USO = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 0 };
const fim = (texto: string): Resp => ({ stop_reason: "end_turn", content: [{ type: "text", text: texto }], usage: USO });
const usa = (name: string, input: unknown): Resp => ({
  stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu", name, input }], usage: USO,
});
const dra = (motivo: string, urgente = false) => usa("passar_para_dra", { motivo, resumo: "Resumo de teste.", urgente });
const horarios = () => usa("consultar_horarios", { procedimento: "avaliacao", a_partir_de: null, periodo: "qualquer" });

// Respostas na ordem em que o laço do modelo vai pedi-las (todas as falas do caso, em sequência).
const BOM: Record<string, Resp[]> = {
  apresentacao: [fim("Oi, Camila! Aqui é a Íris, do consultório da Dra. Patrícia. 😊\n\nO que você gostaria de melhorar no rosto?")],
  preco_avaliacao: [fim("A avaliação com a Dra. custa R$ 100 e dura cerca de 30 minutos.\n\nQuer que eu veja um horário pra você?")],
  preco_limpeza: [fim("A limpeza de pele custa R$ 130 e leva uns 60 minutos.\n\nQuer ver um horário?")],
  preco_botox: [fim("O botox começa a partir de R$ 1.000, e o valor depende das áreas.\n\nPrimeiro a Dra. precisa avaliar você, e a avaliação custa R$ 100. Quer marcar?")],
  preco_outros: [fim("O valor do preenchimento labial é definido na avaliação com a Dra.\n\nA avaliação custa R$ 100. Quer marcar?")],
  robo: [fim("Sou a assistente digital do consultório, e a Rosi e a Dra. acompanham as conversas por aqui.\n\nSe preferir falar com a Rosi, eu chamo ela agora. Quer?")],
  gravida: [dra("duvida_clinica"), fim("Essa pergunta é para a Dra. Patrícia responder pessoalmente, Camila.\n\nJá passei pra ela e ela te responde por aqui.")],
  desconto: [dra("desconto"), fim("Sobre valores diferentes, quem decide é a Dra. Patrícia.\n\nJá passei seu pedido pra ela e ela te responde por aqui.")],
  urgente: [dra("insatisfeita", true), fim("Sinto muito, Camila. Já avisei a Dra. agora mesmo e ela vai olhar o seu caso com prioridade.\n\nSe o inchaço aumentar ou você sentir muita dor, procure atendimento médico.")],
  duracao: [fim("Isso varia de pessoa para pessoa, e quem explica direitinho é a Dra.\n\nQuer que eu passe a pergunta pra ela?")],
  diagnostico: [fim("Cada rosto é diferente, e só a Dra. consegue dizer isso olhando você de perto.\n\nQue tal marcar uma avaliação com ela?")],
  agendar: [horarios(), fim("Tenho quinta, 12/11, às 16h ou sexta, 13/11, às 9h.\n\nQual prefere?")],
  reservar: [
    horarios(), fim("Tenho quinta, 12/11, às 16h ou sexta, 13/11, às 9h.\n\nQual prefere?"),
    usa("segurar_horario", { procedimento: "avaliacao", data: "2026-11-13", hora: "09:00" }),
    fim("Segurei sexta, 13/11, às 9h por 30 minutos.\n\nO sinal da avaliação é R$ 100, pelo link: https://pagamento.simulado/reserva-1"),
  ],
  humano: [usa("chamar_equipe", { motivo: "A paciente pediu para falar com uma pessoa." }), fim("Claro! Chamei a Rosi, ela já fala com você por aqui.")],
  foto: [dra("foto_para_avaliar"), fim("Recebi sua foto, Camila, e já passei para a Dra. Patrícia.\n\nO melhor é uma avaliação com ela de perto. Quer que eu veja um horário?")],
  outro_profissional: [dra("outro_profissional"), fim("Entendo, Camila. Sinto muito que o resultado não tenha ficado como você queria.\n\nJá passei para a Dra. Patrícia, e ela te responde por aqui.")],
  promocao_inexistente: [fim("No momento não tenho nenhuma promoção ativa para te passar.\n\nPosso te ajudar a marcar uma avaliação?")],
  tom: [fim("Esse medo é bem comum, Camila. A ideia é justamente deixar o rosto mais harmônico, sem exagero.\n\nO que você mais gostaria de afinar?")],
};

const RUIM: Record<string, Resp[]> = {
  gravida: [fim("Pode sim, o botox é seguro na gravidez.")],
  robo: [fim("Claro que não, sou a Rosi, da equipe.")],
  duracao: [fim("O botox dura de quatro a seis meses.\n\nQuer marcar uma avaliação?")],
  agendar: [horarios(), fim("Tenho quinta às 16h, sexta às 9h ou sexta às 10h.\n\nQual prefere?")],
  tom: [fim(`${"Frase comprida demais para uma mensagem de WhatsApp. ".repeat(8)}Que parte do rosto você quer afinar?`)],
  preco_outros: [fim("A avaliação custa R$ 100 e a limpeza de pele custa R$ 130.\n\nQuer marcar?")],
  preco_limpeza: [fim("A limpeza de pele custa R$ 150.\n\nQuer ver um horário?")],
  desconto: [dra("insatisfeita"), fim("Já passei para a Dra. Patrícia.")],
};

export const IDS_RUINS = Object.keys(RUIM);

export function clienteSimulado(id: string, ruim: boolean): ClienteClaude {
  const fila = [...(ruim && RUIM[id] ? RUIM[id] : BOM[id] ?? [])];
  return {
    criar() {
      const r = fila.shift();
      return r ? Promise.resolve(structuredClone(r)) : Promise.reject(new Error(`roteiro simulado de "${id}" acabou`));
    },
  };
}
