import { assertEquals } from "@std/assert";
import type { ItemManual } from "./tipos.ts";
import { dividirMensagens, valoresAutorizados, valoresNaoAutorizados } from "./guardas.ts";

const item = (p: Partial<ItemManual> & { chave: string }): ItemManual => ({
  nome: p.chave, o_que_e: "", indicacao: "", preparo: "", cuidados: "", informa_preco: false, preco_texto: "",
  duracao_min: null, agenda_direto: false, sinal_centavos: null, aprovado: true, ...p,
});
const ordenar = (xs: number[]) => [...xs].sort((a, b) => a - b);

Deno.test("divide em até 3 mensagens", () => assertEquals(dividirMensagens("a\n\nb\n\n\nc\n\nd"), ["a", "b", "c\n\nd"]));
Deno.test("divide: apara e descarta vazias", () => assertEquals(dividirMensagens("  a  \n \n\n  \n b\n"), ["a", "b"]));
Deno.test("barra valor fora da lista", () => {
  assertEquals(valoresNaoAutorizados("A avaliação custa R$ 100 e o preenchimento R$ 1.450,00.", [100, 65, 130, 1000]), [1450]);
  assertEquals(valoresNaoAutorizados("Botox a partir de R$ 1.000. Sinal de R$65.", [100, 65, 130, 1000]), []);
});
Deno.test("pega R$ colado, pontuação depois e valor escrito com 'reais'", () => {
  const ok = [100, 65, 130, 1000];
  assertEquals(valoresNaoAutorizados("Fica R$1.000,00, certo?", ok), []);
  assertEquals(valoresNaoAutorizados("Custa R$ 100, e o resto no dia.", ok), []);
  assertEquals(valoresNaoAutorizados("São 100 reais.", ok), []);
  assertEquals(valoresNaoAutorizados("Fica 1.450 reais ou 1 real a mais.", ok), [1450, 1]);
  assertEquals(valoresNaoAutorizados("Custa R$ 99,90!", ok), [99.9]);
  assertEquals(valoresNaoAutorizados("Avaliação R$ 100,00 (R$100).", ok), []);
});
Deno.test("valores autorizados: preços informáveis, sinais e promoções válidas", () => {
  const manual = [
    item({ chave: "avaliacao", informa_preco: true, preco_texto: "R$ 100", sinal_centavos: 10000 }),
    item({ chave: "limpeza_de_pele", informa_preco: true, preco_texto: "R$ 130", sinal_centavos: 6500 }),
    item({ chave: "botox", informa_preco: true, preco_texto: "A partir de R$ 1.000, depende das áreas" }),
    item({ chave: "laser", informa_preco: false, preco_texto: "R$ 777" }),
  ];
  assertEquals(ordenar(valoresAutorizados(manual, [], "2026-11-12")), [65, 100, 130, 1000]);
  const promos = [
    { procedimento_chave: "botox", descricao: "Botox por R$ 1.450,50 até o fim do mês", valido_ate: "2026-11-12" },
    { procedimento_chave: "laser", descricao: "Laser R$ 300", valido_ate: "2026-11-11" },
  ];
  assertEquals(ordenar(valoresAutorizados(manual, promos, "2026-11-12")), [65, 100, 130, 1000, 1450.5]);
});
