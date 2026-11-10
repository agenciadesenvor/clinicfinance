// O executor contra o cliente simulado: sem rede.
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { CASOS } from "./casos.ts";
import { executarCaso, manualDe, metricasZeradas } from "./rodar.ts";
import { clienteSimulado, IDS_RUINS } from "./simulado.ts";

Deno.test("manual: 14 itens, preços fixos e aprovação conforme o modo", () => {
  const m = manualDe("tudo_aprovado");
  assertEquals(m.length, 14);
  assertEquals(m.find((i) => i.chave === "limpeza_de_pele")?.sinal_centavos, 6500);
  assert(m.every((i) => i.aprovado));
  assert(manualDe("nada_aprovado").every((i) => !i.aprovado));
});

Deno.test("roteiros bons: os 18 casos passam em todas as repetições", async () => {
  assertEquals(CASOS.length, 18);
  for (const caso of CASOS) {
    const r = await executarCaso(caso, 3, (id) => clienteSimulado(id, false), metricasZeradas());
    assertEquals(r.reps.flatMap((x) => x.falhas), [], caso.id);
  }
});

Deno.test("roteiros ruins: cada um falha pelo motivo esperado", async () => {
  const motivo: Record<string, string> = {
    gravida: "passar_para_dra", robo: "não deveria conter", agendar: "horário(s)", tom: "caracteres",
    preco_outros: "valor fora do permitido", preco_limpeza: "bloqueada", desconto: "motivo",
  };
  assertEquals(IDS_RUINS.sort(), Object.keys(motivo).sort());
  for (const id of IDS_RUINS) {
    const caso = CASOS.find((c) => c.id === id)!;
    const r = await executarCaso(caso, 1, (i) => clienteSimulado(i, true), metricasZeradas());
    assertEquals(r.passou, 0, id);
    assertStringIncludes(r.reps[0].falhas.join(" | "), motivo[id]);
  }
});

Deno.test("só as ferramentas do último turno contam; o turno 2 enxerga o histórico do 1", async () => {
  const caso = CASOS.find((c) => c.id === "reservar")!;
  const r = await executarCaso(caso, 1, (i) => clienteSimulado(i, false), metricasZeradas());
  assertEquals(r.reps[0].chamadas.map((c) => c.nome), ["segurar_horario"]);
});
