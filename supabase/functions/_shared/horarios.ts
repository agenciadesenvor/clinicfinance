// Cálculo de horários no fuso de Recife. Funções puras: o "agora" sempre chega por parâmetro.
import type { Faixa, Horarios, Ocupado, Procedimento, Slot } from "./tipos.ts";

export const DURACAO_MIN: Record<Procedimento, number> = { avaliacao: 30, limpeza_de_pele: 60 };
// [nossa decisão] a Íris não marca para daqui a menos de 2h
export const ANTECEDENCIA_MIN = 120;

const GRADE_MIN = 30;
const HORIZONTE_DIAS = 14;
const MS_MIN = 60_000;
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type Intervalo = [number, number]; // minutos desde 00:00 do dia

const p2 = (n: number) => String(n).padStart(2, "0");
// Aceita "HH:MM" e "HH:MM:SS" (time do Postgres).
const paraMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const deMin = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
// Minutos (desde a época) da meia-noite da data, tratada como relógio de Recife.
const inicioDoDia = (data: string) => Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10)) / MS_MIN;
const diaSemanaDe = (data: string) => new Date(inicioDoDia(data) * MS_MIN).getUTCDay();
const somaDias = (data: string, n: number) => new Date((inicioDoDia(data) + n * 1440) * MS_MIN).toISOString().slice(0, 10);

// Recife é UTC−3 o ano todo (sem horário de verão): aritmética fixa, sem Intl.
export function agoraRecife(d: Date): { data: string; hora: string; diaSemana: number } {
  const t = new Date(d.getTime() - 3 * 60 * MS_MIN);
  const iso = t.toISOString();
  return { data: iso.slice(0, 10), hora: iso.slice(11, 16), diaSemana: t.getUTCDay() };
}

function mesclar(rs: Intervalo[]): Intervalo[] {
  const ord = rs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Intervalo[] = [];
  for (const [a, b] of ord) {
    const ult = out.at(-1);
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtrair(rs: Intervalo[], [a, b]: Intervalo): Intervalo[] {
  const out: Intervalo[] = [];
  for (const [x, y] of rs) {
    if (b <= x || a >= y) { out.push([x, y]); continue; }
    if (a > x) out.push([x, a]);
    if (b < y) out.push([b, y]);
  }
  return out;
}

const faixa = (f: Faixa): Intervalo => [paraMin(f.inicio), paraMin(f.fim)];

// Faixas abertas do dia: expediente - almoço - bloqueios + extras (extra nunca entra em bloqueio).
function faixasAbertas(data: string, h: Horarios): Intervalo[] {
  const dow = diaSemanaDe(data);
  const doDia = dow === 0 ? null : h.semana[String(dow) as keyof Horarios["semana"]];
  const bloqueios = h.excecoes.filter((e) => e.data === data && e.tipo === "bloqueio").map(faixa);
  const extras = h.excecoes.filter((e) => e.data === data && e.tipo === "extra").map(faixa);
  let rs: Intervalo[] = doDia ? subtrair([faixa(doDia)], faixa(h.almoco)) : [];
  rs = mesclar([...rs, ...extras]);
  for (const b of bloqueios) rs = subtrair(rs, b);
  return mesclar(rs);
}

export function foraDoExpediente(agora: Date, h: Horarios): boolean {
  const { data, hora } = agoraRecife(agora);
  const m = paraMin(hora);
  return !faixasAbertas(data, h).some(([a, b]) => m >= a && m < b);
}

export function duracaoOcupado(o: Ocupado): number {
  if (o.fim) return paraMin(o.fim) - paraMin(o.inicio);
  const norm = (o.procedimento ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  return norm.startsWith("avalia") ? 30 : 60;
}

export function slotsLivres(p: {
  agora: Date; procedimento: Procedimento; horarios: Horarios; ocupados: Ocupado[];
  aPartirDe?: string; periodo?: "manha" | "tarde" | "qualquer"; max?: number;
}): Slot[] {
  const max = p.max ?? 6;
  const dur = DURACAO_MIN[p.procedimento];
  const hoje = agoraRecife(p.agora).data;
  // Mais cedo permitido: agora + antecedência, arredondado PARA CIMA na grade (minutos absolutos de Recife).
  const localMin = (p.agora.getTime() - 3 * 60 * MS_MIN) / MS_MIN;
  const cedo = Math.ceil((localMin + ANTECEDENCIA_MIN) / GRADE_MIN) * GRADE_MIN;
  const primeiro = p.aPartirDe && p.aPartirDe > hoje ? p.aPartirDe : hoje;
  // Intervalos ocupados em minutos absolutos, comparação meio-aberta.
  const oc = p.ocupados.map((o) => {
    const ini = inicioDoDia(o.data) + paraMin(o.inicio);
    return [ini, ini + duracaoOcupado(o)] as Intervalo;
  });

  const out: Slot[] = [];
  for (let i = 0; i < HORIZONTE_DIAS && out.length < max; i++) {
    const data = somaDias(primeiro, i);
    const base = inicioDoDia(data);
    for (const [a, b] of faixasAbertas(data, p.horarios)) {
      for (let t = Math.ceil(a / GRADE_MIN) * GRADE_MIN; t + dur <= b; t += GRADE_MIN) {
        if (out.length >= max) break;
        if (base + t < cedo) continue;
        if (p.periodo === "manha" && t >= 720) continue;
        if (p.periodo === "tarde" && t < 720) continue;
        if (oc.some(([x, y]) => base + t < y && x < base + t + dur)) continue;
        out.push({ data, hora: deMin(t), fim: deMin(t + dur) });
      }
    }
  }
  return out;
}

export function rotuloSlot(s: Slot): string {
  const hh = s.hora.slice(0, 2).replace(/^0/, "");
  const mm = s.hora.slice(3, 5);
  return `${DIAS[diaSemanaDe(s.data)]}, ${s.data.slice(8, 10)}/${s.data.slice(5, 7)}, às ${hh}h${mm === "00" ? "" : mm}`;
}
