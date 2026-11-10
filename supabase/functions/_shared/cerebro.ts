// Um turno da Íris: chama o Claude, executa as ferramentas pedidas e devolve os textos para a paciente.
import Anthropic from "@anthropic-ai/sdk";
import { type Ctx, executarFerramenta, FERRAMENTAS } from "./ferramentas.ts";
import { dividirMensagens, valoresNaoAutorizados } from "./guardas.ts";

export interface ClienteClaude {
  criar(params: Record<string, unknown>): Promise<Anthropic.Beta.BetaMessage>;
}

export function clienteAnthropic(): ClienteClaude {
  // Lê ANTHROPIC_API_KEY. Uma nova tentativa só: uma chamada fica em ~2 min, dentro da trava de 180 s.
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  // Os tipos do SDK não conhecem todos os campos (fallbacks, output_config); o formato no fio é o que vale.
  return { criar: (params) => client.beta.messages.create(params as never) as Promise<Anthropic.Beta.BetaMessage> };
}

export type Bloqueio = "erro_api" | "recusa" | "limite_iteracoes" | "resposta_cortada" | "valor_nao_autorizado";
export interface Resultado {
  textos: string[];
  bloqueio: Bloqueio | null;
  uso: { entrada: number; saida: number; cache_lido: number; cache_escrito: number };
}

export const MAX_ITERACOES = 6;

export async function responder(p: {
  ctx: Ctx; systemEstavel: string; systemContexto: string;
  historico: { role: "user" | "assistant"; content: string }[]; autorizados: number[]; cliente: ClienteClaude;
  // Consultado antes de cada chamada; falso = não seguir (nem chamar o modelo nem rodar mais ferramentas).
  antesDeCadaChamada?: () => Promise<boolean>;
}): Promise<Resultado> {
  const uso = { entrada: 0, saida: 0, cache_lido: 0, cache_escrito: 0 };
  const bloquear = (bloqueio: Bloqueio): Resultado => ({ textos: [], bloqueio, uso });
  // O mesmo system e as mesmas tools em todas as iterações, para o cache valer.
  const system = [
    { type: "text", text: p.systemEstavel, cache_control: { type: "ephemeral" } },
    { type: "text", text: p.systemContexto },
  ];
  // deno-lint-ignore no-explicit-any
  const messages: any[] = p.historico.map((m) => ({ role: m.role, content: m.content }));

  for (let i = 1; i <= MAX_ITERACOES; i++) {
    if (p.antesDeCadaChamada && !(await p.antesDeCadaChamada())) return bloquear("erro_api");
    let r: Anthropic.Beta.BetaMessage;
    try {
      r = await p.cliente.criar({
        model: "claude-opus-5-5", max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        thinking: { type: "adaptive" }, output_config: { effort: "medium" },
        system, tools: FERRAMENTAS, messages,
      });
    } catch (e) {
      console.error("chamada ao Claude falhou:", e);
      return bloquear("erro_api");
    }
    uso.entrada += r.usage?.input_tokens ?? 0;
    uso.saida += r.usage?.output_tokens ?? 0;
    uso.cache_lido += r.usage?.cache_read_input_tokens ?? 0;
    uso.cache_escrito += r.usage?.cache_creation_input_tokens ?? 0;

    // Resposta sem lista de blocos: nada utilizável, falha fechado.
    if (!Array.isArray(r.content)) {
      console.error("resposta do Claude sem content");
      return bloquear("erro_api");
    }
    if (r.stop_reason === "refusal") return bloquear("recusa");
    if (r.stop_reason === "max_tokens") return bloquear("resposta_cortada");

    if (r.stop_reason === "tool_use" || r.stop_reason === "pause_turn") {
      if (r.stop_reason === "tool_use" && i === MAX_ITERACOES) return bloquear("limite_iteracoes");
      messages.push({ role: "assistant", content: r.content }); // inteiro, sem alteração
      if (r.stop_reason === "tool_use") {
        // Em ordem (têm efeitos) e todos os resultados num único turno user.
        const resultados = [];
        for (const b of r.content) {
          if (b.type !== "tool_use") continue;
          resultados.push({ type: "tool_result", tool_use_id: b.id, content: await executarFerramenta(b.name, b.input, p.ctx) });
        }
        messages.push({ role: "user", content: resultados });
      }
      continue;
    }

    // Só end_turn e stop_sequence liberam texto; qualquer outro valor (ou nulo) falha fechado.
    if (r.stop_reason !== "end_turn" && r.stop_reason !== "stop_sequence") {
      console.error("stop_reason inesperado:", r.stop_reason);
      return bloquear("erro_api");
    }
    const texto = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n\n");
    const textos = dividirMensagens(texto);
    if (textos.length === 0) return bloquear("resposta_cortada");
    // Valor fora da lista: não sai, mas o texto fica para a equipe revisar.
    if (valoresNaoAutorizados(textos.join("\n\n"), p.autorizados).length > 0) {
      return { textos, bloqueio: "valor_nao_autorizado", uso };
    }
    return { textos, bloqueio: null, uso };
  }
  return bloquear("limite_iteracoes");
}
