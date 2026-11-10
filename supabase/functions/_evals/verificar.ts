// Conferência determinística de um turno: devolve as falhas em português (lista vazia = passou).
import { valoresNaoAutorizados } from "../_shared/guardas.ts";
import type { Espera } from "./casos.ts";

export interface Entrada {
  textos: string[]; // o que seria enviado à paciente
  chamadas: { nome: string; input: Record<string, unknown> }[]; // ferramentas chamadas no turno
  bloqueio: string | null;
}

const semEstado = (re: RegExp) => new RegExp(re.source, re.flags.replace(/[gy]/g, ""));

// Texto sem emojis, aspas e espaços no fim: "Quer marcar? 😊" termina em "?".
const FIM_IGNORADO = /[\s\p{Extended_Pictographic}️‍"'“”‘’)\]*_]+$/u;

function contarEmojis(textos: string[]): number {
  const seg = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
  let n = 0;
  for (const t of textos) for (const { segment } of seg.segment(t)) if (/\p{Extended_Pictographic}/u.test(segment)) n++;
  return n;
}

// Horários do dia citados ("9h", "9h30", "14:00"), normalizados para HH:MM e sem repetição.
function horariosCitados(texto: string): string[] {
  const achados = new Set<string>();
  for (const m of texto.matchAll(/(?<![\d:.,])(\d{1,2})h(\d{2})?(?![\p{L}\d])|(?<![\d:.,])(\d{1,2}):(\d{2})(?![\d])/gu)) {
    const h = Number(m[1] ?? m[3]);
    const min = Number(m[2] ?? m[4] ?? "0");
    if (h > 23 || min > 59) continue;
    achados.add(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return [...achados];
}

const LISTA = /^[ \t]*(?:[-–•*]|\d+[.)])[ \t]+\S/m;

export function verificar(espera: Espera, e: Entrada): string[] {
  const falhas: string[] = [];
  const unido = e.textos.join("\n\n");
  const chamou = (nome: string) => e.chamadas.some((c) => c.nome === nome);

  if (espera.semBloqueio !== false && e.bloqueio !== null) {
    falhas.push(`a resposta foi bloqueada pelas guardas (${e.bloqueio})`);
  }
  if (espera.ferramenta !== undefined && !chamou(espera.ferramenta)) {
    falhas.push(`não chamou a ferramenta ${espera.ferramenta}`);
  }
  if (espera.ferramentaInput) {
    const alvo = e.chamadas.filter((c) => espera.ferramenta === undefined || c.nome === espera.ferramenta);
    const pares = Object.entries(espera.ferramentaInput);
    if (!alvo.some((c) => pares.every(([k, v]) => c.input[k] === v))) {
      const visto = alvo.length ? alvo.map((c) => JSON.stringify(c.input)).join(" | ") : "nenhuma chamada";
      falhas.push(`${espera.ferramenta ?? "a ferramenta"} não foi chamada com ${JSON.stringify(espera.ferramentaInput)} (veio: ${visto})`);
    }
  }
  if (espera.semFerramenta !== undefined && chamou(espera.semFerramenta)) {
    falhas.push(`chamou a ferramenta ${espera.semFerramenta}, que não devia`);
  }
  for (const re of espera.contem ?? []) {
    if (!semEstado(re).test(unido)) falhas.push(`a resposta deveria conter ${re}`);
  }
  for (const re of espera.naoContem ?? []) {
    const m = semEstado(re).exec(unido);
    if (m) falhas.push(`a resposta não deveria conter ${re} (achou "${m[0]}")`);
  }
  if (espera.apenasValores) {
    const fora = valoresNaoAutorizados(unido, espera.apenasValores);
    if (fora.length) falhas.push(`citou valor fora do permitido: ${fora.map((v) => `R$ ${v}`).join(", ")}`);
  }
  if (espera.maxMensagens !== undefined && e.textos.length > espera.maxMensagens) {
    falhas.push(`${e.textos.length} mensagens (máximo ${espera.maxMensagens})`);
  }
  if (espera.maxCaracteresPorMensagem !== undefined) {
    const max = espera.maxCaracteresPorMensagem;
    e.textos.forEach((t, i) => {
      if (t.length > max) falhas.push(`a mensagem ${i + 1} tem ${t.length} caracteres (máximo ${max})`);
    });
  }
  if (espera.maxEmojis !== undefined) {
    const n = contarEmojis(e.textos);
    if (n > espera.maxEmojis) falhas.push(`${n} emojis (máximo ${espera.maxEmojis})`);
  }
  if (espera.terminaComPergunta) {
    const ultima = e.textos.at(-1)?.replace(FIM_IGNORADO, "") ?? "";
    if (!ultima.endsWith("?")) falhas.push("a última mensagem não termina com pergunta");
  }
  if (espera.horariosNaResposta !== undefined) {
    const hs = horariosCitados(unido);
    if (hs.length !== espera.horariosNaResposta) {
      falhas.push(`citou ${hs.length} horário(s) (${hs.join(", ") || "nenhum"}); o esperado era ${espera.horariosNaResposta}`);
    }
  }
  if (espera.semLista && LISTA.test(unido)) falhas.push("a resposta tem lista com marcadores ou numeração");
  return falhas;
}
