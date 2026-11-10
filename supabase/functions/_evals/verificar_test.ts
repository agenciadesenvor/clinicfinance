import { assertEquals, assertStringIncludes } from "@std/assert";
import { type Entrada, verificar } from "./verificar.ts";

const E = (p: Partial<Entrada> = {}): Entrada => ({ textos: ["Oi, tudo bem?"], chamadas: [], bloqueio: null, ...p });
const chamada = (nome: string, input: Record<string, unknown> = {}) => ({ nome, input });

Deno.test("sem expectativas e sem bloqueio: nada falha", () => {
  assertEquals(verificar({}, E()), []);
});

Deno.test("semBloqueio (padrão): turno bloqueado falha e diz o motivo", () => {
  const f = verificar({}, E({ bloqueio: "valor_nao_autorizado" }));
  assertEquals(f.length, 1);
  assertStringIncludes(f[0], "valor_nao_autorizado");
  assertEquals(verificar({ semBloqueio: false }, E({ bloqueio: "recusa" })), []);
});

Deno.test("ferramenta: passa se chamada ao menos uma vez", () => {
  assertEquals(verificar({ ferramenta: "passar_para_dra" }, E({ chamadas: [chamada("x"), chamada("passar_para_dra")] })), []);
  const f = verificar({ ferramenta: "passar_para_dra" }, E({ chamadas: [chamada("chamar_equipe")] }));
  assertStringIncludes(f[0], "passar_para_dra");
});

Deno.test("semFerramenta: falha se chamada", () => {
  assertEquals(verificar({ semFerramenta: "segurar_horario" }, E()), []);
  const f = verificar({ semFerramenta: "segurar_horario" }, E({ chamadas: [chamada("segurar_horario")] }));
  assertStringIncludes(f[0], "segurar_horario");
});

Deno.test("ferramentaInput: todas as chaves na mesma chamada, em alguma chamada da ferramenta", () => {
  const esp = { ferramenta: "passar_para_dra", ferramentaInput: { motivo: "desconto", urgente: false } };
  const ok = E({ chamadas: [chamada("passar_para_dra", { motivo: "outro", urgente: false }), chamada("passar_para_dra", { motivo: "desconto", urgente: false, resumo: "r" })] });
  assertEquals(verificar(esp, ok), []);
  // as chaves vêm de chamadas diferentes: não vale
  const misto = E({ chamadas: [chamada("passar_para_dra", { motivo: "desconto", urgente: true }), chamada("passar_para_dra", { motivo: "outro", urgente: false })] });
  assertEquals(verificar(esp, misto).length, 1);
  // outra ferramenta com o mesmo valor não conta
  const outra = E({ chamadas: [chamada("chamar_equipe", { motivo: "desconto", urgente: false })] });
  assertEquals(verificar({ ferramentaInput: esp.ferramentaInput, ferramenta: "passar_para_dra" }, outra).length, 2);
  // boolean não é igual a string
  assertEquals(verificar({ ferramenta: "passar_para_dra", ferramentaInput: { urgente: true } }, E({ chamadas: [chamada("passar_para_dra", { urgente: "true" })] })).length, 1);
});

Deno.test("contem e naoContem rodam no texto unido, ignorando a flag g", () => {
  const e = E({ textos: ["Custa R$ 100", "Quer marcar?"] });
  assertEquals(verificar({ contem: [/R\$\s?100/g, /marcar/i] }, e), []);
  assertEquals(verificar({ contem: [/Rosi/] }, e).length, 1);
  const f = verificar({ naoContem: [/marcar/i] }, e);
  assertEquals(f.length, 1);
  assertStringIncludes(f[0], "marcar");
  // regex com g usada duas vezes não pode ficar com estado
  const g = /marcar/g;
  assertEquals(verificar({ contem: [g] }, e), []);
  assertEquals(verificar({ contem: [g] }, e), []);
});

Deno.test("apenasValores: valor fora da lista falha; repetido e vazio passam", () => {
  assertEquals(verificar({ apenasValores: [100] }, E({ textos: ["A avaliação custa R$ 100. Sim, R$ 100."] })), []);
  assertEquals(verificar({ apenasValores: [100] }, E({ textos: ["Sem valores aqui."] })), []);
  const f = verificar({ apenasValores: [100] }, E({ textos: ["Avaliação R$ 100 e limpeza R$ 130"] }));
  assertEquals(f.length, 1);
  assertStringIncludes(f[0], "130");
  assertEquals(verificar({ apenasValores: [100] }, E({ textos: ["custa 800 reais"] })).length, 1);
});

Deno.test("maxMensagens", () => {
  assertEquals(verificar({ maxMensagens: 2 }, E({ textos: ["a", "b"] })), []);
  assertEquals(verificar({ maxMensagens: 2 }, E({ textos: ["a", "b", "c"] })).length, 1);
});

Deno.test("maxCaracteresPorMensagem: confere cada mensagem", () => {
  assertEquals(verificar({ maxCaracteresPorMensagem: 10 }, E({ textos: ["1234567890", "curta"] })), []);
  const f = verificar({ maxCaracteresPorMensagem: 10 }, E({ textos: ["curta", "12345678901"] }));
  assertEquals(f.length, 1);
  assertStringIncludes(f[0], "2");
});

Deno.test("maxEmojis: conta emojis, não letras acentuadas nem sequências ZWJ como vários", () => {
  assertEquals(verificar({ maxEmojis: 1 }, E({ textos: ["Olá, Íris é ótima, já são 5 às 9h! 😊"] })), []);
  assertEquals(verificar({ maxEmojis: 1 }, E({ textos: ["👩‍⚕️ oi"] })), []);
  assertEquals(verificar({ maxEmojis: 1 }, E({ textos: ["oi 😊", "tudo bem ✨"] })).length, 1);
  assertEquals(verificar({ maxEmojis: 0 }, E({ textos: ["oi ❤️"] })).length, 1);
  assertEquals(verificar({ maxEmojis: 1 }, E({ textos: ["😊😊"] })).length, 1);
});

Deno.test("terminaComPergunta: olha a última mensagem e tolera emoji ou aspas no fim", () => {
  const T = { terminaComPergunta: true };
  assertEquals(verificar(T, E({ textos: ["Oi.", "Como posso ajudar?"] })), []);
  assertEquals(verificar(T, E({ textos: ["Como posso ajudar? 😊"] })), []);
  assertEquals(verificar(T, E({ textos: ["Você disse \"sim?\""] })), []);
  assertEquals(verificar(T, E({ textos: ["Quer marcar?", "Combinado."] })).length, 1);
  assertEquals(verificar(T, E({ textos: [] })).length, 1);
});

Deno.test("horariosNaResposta: conta horários distintos, normalizando 9h, 9:00 e 09h00", () => {
  const H2 = { horariosNaResposta: 2 };
  assertEquals(verificar(H2, E({ textos: ["Tenho sexta às 9h ou às 9h30. Qual prefere?"] })), []);
  assertEquals(verificar(H2, E({ textos: ["Tenho 14:00 ou 15:30."] })), []);
  assertEquals(verificar(H2, E({ textos: ["Quinta, às 16h.", "Ou sexta, às 9h."] })), []);
  // repetido não conta duas vezes; 9h e 9:00 são o mesmo horário
  assertEquals(verificar(H2, E({ textos: ["Às 9h. Sim, às 9:00. Também às 10h."] })), []);
  assertEquals(verificar(H2, E({ textos: ["Às 9h ou às 09h00."] })).length, 1);
  assertEquals(verificar(H2, E({ textos: ["Às 9h, 10h ou 11h."] })).length, 1);
  assertEquals(verificar(H2, E({ textos: ["Sem horário nenhum."] })).length, 1);
  // não confunde com valores, datas ou durações
  assertEquals(verificar({ horariosNaResposta: 0 }, E({ textos: ["R$ 100, dia 13/11, 30 min, 1.000"] })), []);
  // hora inválida não é horário
  assertEquals(verificar({ horariosNaResposta: 0 }, E({ textos: ["99h e 25:00"] })), []);
});

Deno.test("semLista: marcadores e numeração no início da linha falham; traço no meio não", () => {
  const L = { semLista: true };
  assertEquals(verificar(L, E({ textos: ["Posso ajudar com isso - sem problema.", "Use *negrito* aqui."] })), []);
  assertEquals(verificar(L, E({ textos: ["Veja:\n- botox\n- preenchimento"] })).length, 1);
  assertEquals(verificar(L, E({ textos: ["• um"] })).length, 1);
  assertEquals(verificar(L, E({ textos: ["* um"] })).length, 1);
  assertEquals(verificar(L, E({ textos: ["Passos:\n1. primeiro\n2. segundo"] })).length, 1);
  assertEquals(verificar(L, E({ textos: ["1) primeiro"] })).length, 1);
});

Deno.test("várias falhas voltam todas, com bloqueio primeiro", () => {
  const f = verificar({ ferramenta: "x", maxMensagens: 0 }, E({ bloqueio: "recusa" }));
  assertEquals(f.length, 3);
  assertStringIncludes(f[0], "recusa");
});
