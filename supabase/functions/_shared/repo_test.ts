import { assertEquals } from "@std/assert";
import { agendamentoParaOcupado } from "./repo.ts";

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
