import { assertEquals } from "@std/assert";
import { agendamentoParaOcupado, linhasDeMensagens } from "./repo.ts";
import { criarRepoFake } from "./repo_fake.ts";

Deno.test("agendamento sem hora de início não bloqueia", () => {
  assertEquals(agendamentoParaOcupado({ data: "2026-11-13", hora_inicio: null, hora_fim: null, status: "agendado" }), null);
});
Deno.test("agendamento: HH:MM:SS vira HH:MM e fim nulo fica nulo", () => {
  assertEquals(
    agendamentoParaOcupado({ data: "2026-11-13", hora_inicio: "09:00:00", hora_fim: null, procedimento: "Limpeza", status: "agendado" }),
    { data: "2026-11-13", inicio: "09:00", fim: null, procedimento: "Limpeza" },
  );
  assertEquals(
    agendamentoParaOcupado({ data: "2026-11-13", hora_inicio: "09:00:00", hora_fim: "10:00:00", status: "agendado" })?.fim,
    "10:00",
  );
});
Deno.test("agendamento cancelado libera; status nulo ocupa", () => {
  assertEquals(agendamentoParaOcupado({ data: "2026-11-13", hora_inicio: "09:00:00", status: "cancelado" }), null);
  assertEquals(agendamentoParaOcupado({ data: "2026-11-13", hora_inicio: "09:00:00", status: null })?.inicio, "09:00");
});

Deno.test("fake: trava com dono; token antigo não renova nem destrava", async () => {
  const fake = criarRepoFake({ agora: new Date("2026-11-13T01:30:00Z") });
  const id = fake.conversa.id;
  const t1 = await fake.travar(id, 180);
  assertEquals(await fake.travar(id, 180), null);
  fake.agora = new Date(fake.agora.getTime() + 181_000);
  const t2 = await fake.travar(id, 180); // a primeira venceu
  assertEquals(typeof t2, "string");
  assertEquals(await fake.renovar(id, t1!, 180), null);
  await fake.destravar(id, t1!);
  assertEquals(await fake.travar(id, 180), null, "token antigo soltou a trava");
  assertEquals(typeof (await fake.renovar(id, t2!, 180)), "string");
});

Deno.test("linhasDeMensagens: created_at estritamente crescente na ordem e campos preservados", () => {
  const base = new Date("2026-11-13T01:30:00.000Z");
  const linhas = linhasDeMensagens("c1", "u1", [
    { autor: "iris", texto: "a", status: "enviada", fora_expediente: true, meta: { uso: 1, cobre_ate: "p1" } },
    { autor: "iris", texto: "b", status: "enviada", fora_expediente: true },
    { autor: "iris", texto: "c", status: "rascunho" },
  ], base);
  assertEquals(linhas.map((l) => l.created_at), [
    "2026-11-13T01:30:00.000Z", "2026-11-13T01:30:00.001Z", "2026-11-13T01:30:00.002Z",
  ]);
  assertEquals(linhas.map((l) => [l.user_id, l.conversa_id, l.autor, l.texto, l.status, l.fora_expediente, l.meta]), [
    ["u1", "c1", "iris", "a", "enviada", true, { uso: 1, cobre_ate: "p1" }],
    ["u1", "c1", "iris", "b", "enviada", true, {}],
    ["u1", "c1", "iris", "c", "rascunho", false, {}],
  ]);
});
