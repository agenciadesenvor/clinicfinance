import { assert, assertEquals } from "@std/assert";
import type { Horarios, Ocupado } from "./tipos.ts";
import {
  agoraRecife,
  duracaoOcupado,
  foraDoExpediente,
  rotuloSlot,
  slotsLivres,
} from "./horarios.ts";

const H: Horarios = {
  semana: {
    "1": { inicio: "09:00", fim: "18:00" },
    "2": { inicio: "09:00", fim: "18:00" },
    "3": { inicio: "09:00", fim: "18:00" },
    "4": { inicio: "09:00", fim: "18:00" },
    "5": { inicio: "09:00", fim: "18:00" },
    "6": { inicio: "09:00", fim: "12:00" },
  },
  almoco: { inicio: "12:00", fim: "13:00" },
  excecoes: [],
};

Deno.test("22h30 de quinta em Recife é quinta, não sexta", () => {
  assertEquals(agoraRecife(new Date("2026-11-13T01:30:00Z")), { data: "2026-11-12", hora: "22:30", diaSemana: 4 });
});
Deno.test("primeiro horário depois de quinta 22h30 é sexta 09:00", () => {
  const s = slotsLivres({ agora: new Date("2026-11-13T01:30:00Z"), procedimento: "avaliacao", horarios: H, ocupados: [] });
  assertEquals(s[0], { data: "2026-11-13", hora: "09:00", fim: "09:30" });
});
Deno.test("nunca dentro do almoço nem cruzando o almoço", () => {
  const s = slotsLivres({ agora: new Date("2026-11-16T03:00:00Z"), procedimento: "limpeza_de_pele", horarios: H, ocupados: [], max: 40 });
  assert(!s.some(x => x.hora === "11:30" || x.hora === "12:00" || x.hora === "12:30"));
});
Deno.test("sábado acaba ao meio-dia; domingo fechado", () => {
  const s = slotsLivres({ agora: new Date("2026-11-14T03:00:00Z"), procedimento: "limpeza_de_pele", horarios: H, ocupados: [], max: 40 });
  assertEquals(s.filter(x => x.data === "2026-11-14").at(-1)?.hora, "11:00");
  assert(!s.some(x => x.data === "2026-11-15"));
});
Deno.test("respeita 2h de antecedência", () => {
  const s = slotsLivres({ agora: new Date("2026-11-12T13:10:00Z"), procedimento: "avaliacao", horarios: H, ocupados: [] }); // 10h10 em Recife
  assertEquals(s[0].hora, "13:00"); // 12:10 arredonda para 12:30, que é almoço
});
Deno.test("agendamento sem hora_fim ocupa a duração padrão", () => {
  const o: Ocupado[] = [{ data: "2026-11-13", inicio: "09:00", fim: null, procedimento: "Botox" }];
  const s = slotsLivres({ agora: new Date("2026-11-13T01:30:00Z"), procedimento: "avaliacao", horarios: H, ocupados: o });
  assertEquals(s[0].hora, "10:00");
});
Deno.test("exceções: bloqueio remove e extra estende até 19h", () => {
  const h = { ...H, excecoes: [
    { data: "2026-11-13", tipo: "bloqueio", inicio: "09:00", fim: "12:00" },
    { data: "2026-11-13", tipo: "extra", inicio: "18:00", fim: "19:00" } ] } as Horarios;
  const s = slotsLivres({ agora: new Date("2026-11-13T01:30:00Z"), procedimento: "avaliacao", horarios: h, ocupados: [], max: 40 })
    .filter(x => x.data === "2026-11-13");
  assertEquals(s[0].hora, "13:00"); assertEquals(s.at(-1)?.hora, "18:30");
});
Deno.test("fora do expediente", () => {
  assert(foraDoExpediente(new Date("2026-11-13T01:30:00Z"), H));   // qui 22h30
  assert(foraDoExpediente(new Date("2026-11-12T15:30:00Z"), H));   // qui 12h30 (almoço)
  assert(foraDoExpediente(new Date("2026-11-14T16:00:00Z"), H));   // sáb 13h
  assert(!foraDoExpediente(new Date("2026-11-12T17:00:00Z"), H));  // qui 14h
});
Deno.test("rótulo", () => assertEquals(rotuloSlot({ data: "2026-11-12", hora: "14:00", fim: "14:30" }), "quinta, 12/11, às 14h"));

Deno.test("rótulo com minutos", () => assertEquals(rotuloSlot({ data: "2026-11-13", hora: "10:30", fim: "11:00" }), "sexta, 13/11, às 10h30"));

Deno.test("aPartirDe pula os dias anteriores", () => {
  const s = slotsLivres({ agora: new Date("2026-11-13T01:30:00Z"), procedimento: "avaliacao", horarios: H, ocupados: [], aPartirDe: "2026-11-16" });
  assertEquals(s[0], { data: "2026-11-16", hora: "09:00", fim: "09:30" });
});
Deno.test("periodo tarde só traz inícios a partir das 12:00", () => {
  const s = slotsLivres({ agora: new Date("2026-11-13T01:30:00Z"), procedimento: "avaliacao", horarios: H, ocupados: [], periodo: "tarde", max: 20 });
  assertEquals(s[0].hora, "13:00");
  assert(s.every(x => x.hora >= "12:00"));
});
Deno.test("ocupado com HH:MM:SS bloqueia o horário", () => {
  const o: Ocupado[] = [{ data: "2026-11-13", inicio: "09:00:00", fim: "10:00:00", procedimento: null }];
  const s = slotsLivres({ agora: new Date("2026-11-13T01:30:00Z"), procedimento: "avaliacao", horarios: H, ocupados: o });
  assertEquals(s[0].hora, "10:00");
});
Deno.test("duração de ocupado: Avaliação 30, sem procedimento 60", () => {
  assertEquals(duracaoOcupado({ data: "2026-11-13", inicio: "09:00", fim: null, procedimento: "Avaliação" }), 30);
  assertEquals(duracaoOcupado({ data: "2026-11-13", inicio: "09:00", fim: null, procedimento: null }), 60);
  assertEquals(duracaoOcupado({ data: "2026-11-13", inicio: "09:00", fim: "09:45", procedimento: null }), 45);
});
Deno.test("max limita o resultado", () => {
  const s = slotsLivres({ agora: new Date("2026-11-13T01:30:00Z"), procedimento: "avaliacao", horarios: H, ocupados: [], max: 3 });
  assertEquals(s.length, 3);
});
