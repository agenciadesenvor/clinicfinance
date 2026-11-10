// Guardas determinísticas aplicadas à saída do modelo, antes de qualquer envio.
import type { ItemManual, Promocao } from "./tipos.ts";

const MAX_MENSAGENS = 3;

// Cada parágrafo vira uma mensagem; o que passar da 3ª fica junto na última.
export function dividirMensagens(texto: string): string[] {
  const partes = texto.split(/\n[ \t]*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (partes.length <= MAX_MENSAGENS) return partes;
  return [...partes.slice(0, MAX_MENSAGENS - 1), partes.slice(MAX_MENSAGENS - 1).join("\n\n")];
}

// Número no formato brasileiro: "1.000", "65,00", "1.450,50", "100".
const NUM = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
const COM_CIFRAO = new RegExp(String.raw`R\$\s*` + NUM, "g");
const COM_REAIS = new RegExp(String.raw`(?<![\d.,])` + NUM + String.raw`\s*(?:reais|real)(?![\p{L}])`, "giu");

const paraNumero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

function valoresCitados(texto: string): number[] {
  const achados: { pos: number; valor: number }[] = [];
  for (const re of [COM_CIFRAO, COM_REAIS]) {
    for (const m of texto.matchAll(re)) achados.push({ pos: m.index ?? 0, valor: paraNumero(m[1]) });
  }
  return achados.sort((a, b) => a.pos - b.pos).map((a) => a.valor);
}

const mesmoValor = (a: number, b: number) => Math.abs(a - b) < 0.005;

function unicos(xs: number[]): number[] {
  const out: number[] = [];
  for (const x of xs) if (!out.some((y) => mesmoValor(x, y))) out.push(x);
  return out;
}

export function valoresAutorizados(manual: ItemManual[], promocoes: Promocao[], hoje: string): number[] {
  const vs: number[] = [];
  for (const it of manual) {
    if (it.informa_preco) vs.push(...valoresCitados(it.preco_texto ?? ""));
    if (it.sinal_centavos != null) vs.push(it.sinal_centavos / 100);
  }
  for (const p of promocoes) if (p.valido_ate >= hoje) vs.push(...valoresCitados(p.descricao));
  return unicos(vs);
}

// Valores em reais citados no texto que não estão autorizados (sem repetição, na ordem em que aparecem).
export function valoresNaoAutorizados(texto: string, autorizados: number[]): number[] {
  return unicos(valoresCitados(texto).filter((v) => !autorizados.some((a) => mesmoValor(a, v))));
}
