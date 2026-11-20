import { assertEquals } from "@std/assert";
import type { IrisConfig, ItemManual } from "./tipos.ts";
import { dividirMensagens, valoresAutorizados, valoresNaoAutorizados } from "./guardas.ts";

const item = (p: Partial<ItemManual> & { chave: string }): ItemManual => ({
  nome: p.chave, o_que_e: "", indicacao: "", preparo: "", cuidados: "", informa_preco: false, preco_texto: "",
  duracao_min: null, agenda_direto: false, sinal_centavos: null, aprovado: true, ...p,
});
const ordenar = (xs: number[]) => [...xs].sort((a, b) => a - b);
const CONFIG: IrisConfig = {
  modo: "supervisionado",
  horarios: { semana: { "1": null, "2": null, "3": null, "4": null, "5": null, "6": null }, almoco: { inicio: "12:00", fim: "13:00" }, excecoes: [] },
  endereco: "", como_chegar: "", formas_pagamento: "", politica_cancelamento: "", politica_atraso: "", nunca_dizer: "",
  frase_emergencia: "",
};

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
  assertEquals(ordenar(valoresAutorizados(manual, [], "2026-11-12", CONFIG)), [65, 100, 130, 1000]);
  const promos = [
    { procedimento_chave: "botox", descricao: "Botox por R$ 1.450,50 até o fim do mês", valido_ate: "2026-11-12" },
    { procedimento_chave: "laser", descricao: "Laser R$ 300", valido_ate: "2026-11-11" },
  ];
  assertEquals(ordenar(valoresAutorizados(manual, promos, "2026-11-12", CONFIG)), [65, 100, 130, 1000, 1450.5]);
});
Deno.test("pega variações de R$: minúsculo, espaço antes do $ e RS", () => {
  assertEquals(valoresNaoAutorizados("Fica r$ 900.", [100]), [900]);
  assertEquals(valoresNaoAutorizados("Fica R $ 900.", [100]), [900]);
  assertEquals(valoresNaoAutorizados("Fica RS 900 ou rs900.", [100]), [900]);
  assertEquals(valoresNaoAutorizados("Fica RS 1.200,50.", [100]), [1200.5]);
});
Deno.test("não confunde telefone, data, hora nem palavras com rs", () => {
  assertEquals(valoresNaoAutorizados("Ligue (81) 99999-9999. Dia 13/11/2026 às 14:30, sala 2. Cursos 3 vezes.", [100]), []);
  assertEquals(valoresNaoAutorizados("Tenho quinta às 14h ou sexta às 10h.", [100]), []);
});
Deno.test("divide: normaliza \\r\\n", () => assertEquals(dividirMensagens("a\r\n\r\nb"), ["a", "b"]));
Deno.test("valores autorizados: R$ das informações práticas entram, os de 'nunca dizer' não", () => {
  const config: IrisConfig = {
    ...CONFIG,
    politica_cancelamento: "Cancelamento com menos de 24h tem taxa de R$ 50.",
    formas_pagamento: "Pix ou cartão; parcelas a partir de R$ 200,00.",
    nunca_dizer: "Nunca diga que a Dra. cobra R$ 3.000 de ninguém.",
  };
  const v = valoresAutorizados([], [], "2026-11-12", config);
  assertEquals(ordenar(v), [50, 200]);
  assertEquals(valoresNaoAutorizados("Com menos de 24h a taxa é de R$ 50.", v), []);
  assertEquals(valoresNaoAutorizados("Fica R$ 3.000.", v), [3000]);
});
Deno.test("valores autorizados: o sinal efetivo de avaliação e limpeza entra mesmo sem sinal no Manual", () => {
  const manual = [item({ chave: "avaliacao" }), item({ chave: "limpeza_de_pele", sinal_centavos: 0 })];
  assertEquals(ordenar(valoresAutorizados(manual, [], "2026-11-12", CONFIG)), [65, 100]);
});
