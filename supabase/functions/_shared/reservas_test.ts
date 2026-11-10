import { assertEquals } from "@std/assert";
import { criarRepoFake } from "./repo_fake.ts";
import { efeitosSimulados } from "./ferramentas.ts";
import { confirmarReserva } from "./reservas.ts";
import type { Procedimento } from "./tipos.ts";

const AGORA = new Date("2026-11-13T01:30:00Z"); // quinta 22:30 em Recife
const ENDERECO = "Rua das Flores, 100, sala 2";
const SLOT = { data: "2026-11-13", hora: "09:00", fim: "09:30" };

async function montar(opts: { endereco?: string; proc?: Procedimento } = {}) {
  const fake = criarRepoFake({ agora: AGORA, config: { endereco: opts.endereco ?? ENDERECO } });
  const proc = opts.proc ?? "avaliacao";
  const s = proc === "avaliacao" ? SLOT : { ...SLOT, fim: "10:00" };
  const reserva = (await fake.segurar(fake.conversa.id, proc, s, 10000))!;
  const efeitos = efeitosSimulados(fake, fake.conversa.id);
  const confirmar = (nome = "Camila", agora = AGORA, id = reserva.id) =>
    confirmarReserva({ repo: fake, efeitos, reservaId: id, agora, config: fake.config, nome });
  const textos = (autor: string) => fake.mensagens.filter((m) => m.autor === autor).map((m) => m.texto);
  // Passa o prazo de 30 minutos sem mexer no relógio do repo.
  const DEPOIS = new Date(AGORA.getTime() + 31 * 60_000);
  return { fake, reserva, confirmar, textos, DEPOIS };
}

const NOTAS = [
  "📅 Agendamento que seria criado: avaliação, sexta, 13/11, às 9h",
  "📌 O card iria para: agendado",
  "🏷️ Etiqueta que seria aplicada: Sinal pago",
];

Deno.test("confirma dentro do prazo: paga, 3 notas e 3 mensagens", async () => {
  const { fake, reserva, confirmar, textos } = await montar();
  assertEquals(await confirmar(), "confirmada");
  assertEquals(fake.reservas[0].status, "paga");
  assertEquals(fake.pagoEm[reserva.id], AGORA.toISOString());
  assertEquals(textos("sistema").slice(-3), NOTAS);
  assertEquals(textos("iris"), [
    "Pagamento confirmado, Camila. Sua avaliação está marcada para sexta, 13/11, às 9h.",
    ENDERECO,
    "Um dia antes eu te envio uma confirmação.",
  ]);
  assertEquals(fake.mensagens.filter((m) => m.autor === "iris").every((m) => m.status === "enviada"), true);
});

Deno.test("segunda chamada devolve ja_confirmada e não duplica", async () => {
  const { fake, confirmar } = await montar();
  await confirmar();
  const antes = fake.mensagens.length;
  assertEquals(await confirmar(), "ja_confirmada");
  assertEquals(fake.mensagens.length, antes);
  assertEquals(fake.pendencias.length, 0);
});

Deno.test("vencida com horário livre confirma igual", async () => {
  const { fake, confirmar, textos, DEPOIS } = await montar();
  assertEquals(await confirmar("Camila", DEPOIS), "confirmada");
  assertEquals(fake.reservas[0].status, "paga");
  assertEquals(textos("sistema").slice(-3), NOTAS);
  assertEquals(textos("iris").length, 3);
});

Deno.test("cancelada com horário livre confirma", async () => {
  const { fake, reserva, confirmar } = await montar();
  await fake.marcarReserva(reserva.id, "cancelada");
  assertEquals(await confirmar(), "confirmada");
  assertEquals(fake.reservas[0].status, "paga");
});

Deno.test("vencida com horário ocupado: horario_perdido, pendência e 2 alternativas", async () => {
  const { fake, confirmar, textos, DEPOIS } = await montar();
  fake.ocupar({ data: "2026-11-13", inicio: "09:00", fim: "09:30", procedimento: "avaliacao" });
  assertEquals(await confirmar("Camila", DEPOIS), "horario_perdido");
  assertEquals(fake.reservas[0].status, "expirada");
  assertEquals(textos("sistema").filter((t) => t.includes("Agendamento")).length, 0);
  assertEquals(fake.pendencias, [{
    id: "pend-1", motivo: "pagamento_apos_prazo", urgente: false, status: "aberta",
    resumo: "Pagamento recebido depois do prazo e o horário de sexta, 13/11, às 9h já estava ocupado. Valor fica como crédito.",
  }]);
  assertEquals(textos("iris"), [
    "Recebi seu pagamento, Camila, mas esse horário acabou de ser ocupado. Seu valor fica como crédito. Posso te oferecer sexta, 13/11, às 9h30 ou sexta, 13/11, às 10h?",
  ]);
});

Deno.test("segunda chamada após horario_perdido não repete mensagem nem pendência", async () => {
  const { fake, confirmar, DEPOIS } = await montar();
  fake.ocupar({ data: "2026-11-13", inicio: "09:00", fim: "09:30", procedimento: "avaliacao" });
  await confirmar("Camila", DEPOIS);
  const antes = fake.mensagens.length;
  assertEquals(await confirmar("Camila", DEPOIS), "horario_perdido");
  assertEquals(fake.mensagens.length, antes);
  assertEquals(fake.pendencias.length, 1);
});

Deno.test("horário perdido com menos de 2 alternativas passa para a equipe", async () => {
  const { fake, confirmar, textos, DEPOIS } = await montar();
  fake.ocupar({ data: "2026-11-13", inicio: "09:00", fim: "09:30", procedimento: "avaliacao" });
  fake.config.horarios.excecoes = [];
  for (const d of ["1", "2", "3", "4", "5", "6"] as const) fake.config.horarios.semana[d] = null;
  assertEquals(await confirmar("Camila", DEPOIS), "horario_perdido");
  assertEquals(textos("iris"), [
    "Recebi seu pagamento, Camila, mas esse horário acabou de ser ocupado. Seu valor fica como crédito. A equipe vai falar com você para remarcar.",
  ]);
});

Deno.test("endereço vazio: duas mensagens", async () => {
  const { confirmar, textos } = await montar({ endereco: "  " });
  await confirmar();
  assertEquals(textos("iris"), [
    "Pagamento confirmado, Camila. Sua avaliação está marcada para sexta, 13/11, às 9h.",
    "Um dia antes eu te envio uma confirmação.",
  ]);
});

Deno.test("nome vazio: sem vocativo", async () => {
  const { confirmar, textos } = await montar();
  await confirmar("");
  assertEquals(textos("iris")[0], "Pagamento confirmado. Sua avaliação está marcada para sexta, 13/11, às 9h.");
});

Deno.test("nome vazio no horário perdido: sem vocativo", async () => {
  const { fake, confirmar, textos, DEPOIS } = await montar();
  fake.ocupar({ data: "2026-11-13", inicio: "09:00", fim: "09:30", procedimento: "avaliacao" });
  await confirmar("", DEPOIS);
  assertEquals(textos("iris")[0].startsWith("Recebi seu pagamento, mas esse horário"), true);
});

Deno.test("limpeza de pele usa o nome legível", async () => {
  const { textos, confirmar } = await montar({ proc: "limpeza_de_pele" });
  await confirmar();
  assertEquals(textos("iris")[0], "Pagamento confirmado, Camila. Sua limpeza de pele está marcada para sexta, 13/11, às 9h.");
  assertEquals(textos("sistema").slice(-3)[0].startsWith("📅 Agendamento que seria criado: limpeza de pele,"), true);
});

Deno.test("reserva inexistente", async () => {
  const { confirmar } = await montar();
  assertEquals(await confirmar("Camila", AGORA, "nao-existe"), "inexistente");
});

Deno.test("pagarReserva no fake: segunda chamada devolve false", async () => {
  const { fake, reserva } = await montar();
  assertEquals(await fake.pagarReserva(reserva.id), true);
  assertEquals(await fake.pagarReserva(reserva.id), false);
  assertEquals(await fake.pagarReserva("nao-existe"), false);
});
