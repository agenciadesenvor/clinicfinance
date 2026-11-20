import { assertEquals } from "@std/assert";
import { cors, temAcesso } from "./http.ts";

const req = (origin?: string) =>
  new Request("http://localhost/functions/v1/iris-chat", { method: "POST", headers: origin ? { origin } : {} });

Deno.test("cors devolve a origem permitida", () => {
  assertEquals(cors(req("https://clinicfinance.vercel.app")).get("access-control-allow-origin"), "https://clinicfinance.vercel.app");
  assertEquals(cors(req("http://localhost:3456")).get("access-control-allow-origin"), "http://localhost:3456");
});

Deno.test("cors não devolve outra origem", () => {
  assertEquals(cors(req("https://evil.example")).get("access-control-allow-origin"), null);
  assertEquals(cors(req()).get("access-control-allow-origin"), null);
});

Deno.test("cors traz cabeçalhos, métodos e Vary", () => {
  const h = cors(req("https://evil.example"));
  assertEquals(h.get("access-control-allow-headers"), "authorization, x-client-info, apikey, content-type");
  assertEquals(h.get("access-control-allow-methods"), "POST, OPTIONS");
  assertEquals(h.get("vary"), "Origin");
});

Deno.test("temAcesso: sem lista, lista vazia ou só espaços ninguém entra", () => {
  assertEquals(temAcesso("dra@clinica.com", undefined), false);
  assertEquals(temAcesso("dra@clinica.com", ""), false);
  assertEquals(temAcesso("dra@clinica.com", "  ,  , "), false);
});

Deno.test("temAcesso: e-mail vazio nunca entra", () => {
  assertEquals(temAcesso("", "dra@clinica.com"), false);
  assertEquals(temAcesso("", "dra@clinica.com,"), false);
});

Deno.test("temAcesso: compara sem diferença de maiúsculas e ignora espaços", () => {
  assertEquals(temAcesso("dra@clinica.com", " Dra@Clinica.COM "), true);
  assertEquals(temAcesso("DRA@clinica.com", "dra@clinica.com"), true);
});

Deno.test("temAcesso: quem não está na lista fica de fora; quem está entre vários entra", () => {
  const lista = "rosi@clinica.com, dra@clinica.com ,, outra@clinica.com";
  assertEquals(temAcesso("intrusa@gmail.com", lista), false);
  assertEquals(temAcesso("dra@clinica.com", lista), true);
  assertEquals(temAcesso("outra@clinica.com", lista), true);
  assertEquals(temAcesso("dra@clinica", lista), false);
});
