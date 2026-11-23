/* ============================================================
   ClinicFinance — dashboard.js
   Tela inicial no visual Pinhal: capa com foto, cartão Financeiro
   (laranja, com o gráfico de receita), Atendimentos (verde, linha com
   pico), mini calendário da agenda, últimas entradas, pendências do
   dia e despesas por categoria em barras.
   ============================================================ */

/* ===== Período anterior equivalente ao filtro escolhido ===== */
function dashPrevRange() {
  const { s, e } = getDateRange();
  const p = state.filter.period;
  const d = (y, m, dd, h = 0, mi = 0, se = 0) => new Date(y, m, dd, h, mi, se);
  if (p === 'today') return { s: d(s.getFullYear(), s.getMonth(), s.getDate() - 1), e: d(s.getFullYear(), s.getMonth(), s.getDate() - 1, 23, 59, 59), label: 'ontem' };
  if (p === 'week') return { s: d(s.getFullYear(), s.getMonth(), s.getDate() - 7), e: d(e.getFullYear(), e.getMonth(), e.getDate() - 7, 23, 59, 59), label: 'semana passada' };
  if (p === 'month' || !p) {
    const ps = d(s.getFullYear(), s.getMonth() - 1, 1);
    const last = new Date(ps.getFullYear(), ps.getMonth() + 1, 0).getDate();
    return { s: ps, e: d(ps.getFullYear(), ps.getMonth(), Math.min(e.getDate(), last), 23, 59, 59), label: 'mês passado' };
  }
  if (p === 'year') return { s: d(s.getFullYear() - 1, 0, 1), e: d(e.getFullYear() - 1, e.getMonth(), e.getDate(), 23, 59, 59), label: 'ano passado' };
  const span = e - s;
  return { s: new Date(s.getTime() - span - 1000), e: new Date(s.getTime() - 1000), label: 'período anterior' };
}

/* Receita, despesas, lucro e atendimentos num intervalo (mesma regra dos filtros) */
function dashTotals(s, e) {
  const { entries, exits, clinic } = getData();
  const inR = x => { const dt = new Date(x.date + 'T12:00:00'); return dt >= s && dt <= e; };
  const fe = entries.filter(inR);
  let fc = clinicOccurrences(clinic, s, e);
  if (state.filter.period === 'today' || state.filter.period === 'week') fc = fc.filter(inR);
  const rev = fe.reduce((t, x) => t + x.value, 0);
  const exp = exits.filter(inR).reduce((t, x) => t + x.value, 0) + fc.reduce((t, x) => t + x.value, 0);
  return { rev, exp, lucro: rev - exp, n: fe.length };
}

function dashChip(cur, prev, upIsBad = false) {
  if (!prev) return '';
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (!isFinite(pct)) return '';
  const up = pct >= 0, good = upIsBad ? !up : up;
  const v = Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(0);
  return `<span class="dchip ${good ? 'good' : 'bad'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="${up ? '4 17 10 11 14 15 20 8' : '4 8 10 14 14 10 20 17'}"/><polyline points="${up ? '14 8 20 8 20 14' : '14 17 20 17 20 11'}"/></svg>${v}%</span>`;
}

function dashKpi({ icon, tone, title, value, money, cur, prev, prevLabel, go, upIsBad }) {
  const fmt = v => money ? fCurrency(v) : String(v);
  return `<article class="dkpi" role="link" tabindex="0" onclick="navigateTo('${go}')" onkeydown="if(event.key==='Enter')navigateTo('${go}')" aria-label="${title}: ver detalhes">
    <div class="dkpi-head">
      <span class="dkpi-icon ${tone}">${icon}</span>
      <span class="dkpi-title">${title}</span>
      <span class="dkpi-more" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9.5"/><circle cx="8" cy="12" r=".6" fill="currentColor"/><circle cx="12" cy="12" r=".6" fill="currentColor"/><circle cx="16" cy="12" r=".6" fill="currentColor"/></svg></span>
    </div>
    <div class="dkpi-body">
      <span class="dkpi-value" data-count="${value}" data-money="${money ? 1 : 0}">${fmt(value)}</span>
      <span class="dkpi-cmp">${dashChip(cur, prev, upIsBad)}<span>${prev > 0 ? `${prevLabel[0].toUpperCase() + prevLabel.slice(1)}: ${fmt(prev)}` : ''}</span></span>
    </div>
  </article>`;
}

/* ===== Tela (visual Pinhal) =====
   Capa com foto · filtro de período · Financeiro (laranja) · Atendimentos (verde) ·
   Agenda (mini calendário) · Últimas entradas · Agenda e pendências · Despesas por categoria */
function dashSaudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
// "Boa tarde, Dra. Patrícia" — o tratamento vem do Perfil (nunca deduzido do nome)
function dashSaudacaoHTML() {
  const nome = (currentProfile?.first_name || '').trim().split(/\s+/)[0] || '';
  const trat = ['Dra.', 'Dr.'].includes(currentProfile?.tratamento) ? currentProfile.tratamento + ' ' : '';
  return `${dashSaudacao()}${nome ? `, <em>${esc(trat + nome)}</em>` : ''}`;
}
function dashHeroHTML() {
  const hoje = new Date();
  const dataTxt = hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const nAg = getTodayAppointments().length;
  const nPend = getFollowupsDue().length + getUpcomingClinicPayments().length;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const resumo = nAg || nPend
    ? `Você tem ${plural(nAg, 'agendamento', 'agendamentos')} hoje e ${plural(nPend, 'pendência', 'pendências')}`
    : 'Agenda livre hoje e nada pendente';
  return `<section class="hero" id="dashHero">
    <div class="hero-photo" id="heroPhoto" aria-hidden="true"></div>
    <div class="hero-text">
      <div class="mono-label hero-trail">ClinicFinance / Início · ${esc(dataTxt)}</div>
      <h1 class="hero-hello">${dashSaudacaoHTML()}</h1>
      <p class="mono-label hero-sum">${esc(resumo)}</p>
      <div class="hero-actions">
        <button type="button" class="hero-pill" onclick="openEntradaModal()">+ Entrada</button>
        <button type="button" class="hero-pill" onclick="openSaidaModal()">+ Saída</button>
        <button type="button" class="hero-pill" onclick="navigateTo('agenda')">+ Agendamento</button>
        <button type="button" class="hero-pill" onclick="navigateTo('pacientes'); setTimeout(() => openCrmModal(null, 'pacientes'), 80)">+ Paciente</button>
      </div>
    </div>
    <button type="button" class="hero-change" onclick="pickCapa()" aria-label="Trocar a foto da capa">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l2-3h6l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"/><circle cx="12" cy="13" r="3.5"/></svg>
      <span>Trocar foto</span>
    </button>
  </section>`;
}
// Põe (ou tira) a foto da capa sem redesenhar a tela
function applyCapa() {
  const hero = document.getElementById('dashHero'), ph = document.getElementById('heroPhoto');
  if (!hero || !ph) return;
  const d = currentProfile?.capa_data || '';
  hero.classList.toggle('has-photo', !!d);
  ph.style.backgroundImage = d ? `url("${d}")` : '';
}

function dashMiniCalHTML() {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7; // segunda = 0
  const days = new Date(y, m + 1, 0).getDate();
  const iso = d => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span class="h3-day is-empty"></span>');
  for (let d = 1; d <= days; d++) cells.push(`<span class="h3-day${d === now.getDate() ? ' is-today' : ''}" data-date="${iso(d)}">${d}</span>`);
  const nAg = getTodayAppointments().length;
  return `<div class="h3-cal-head mono-label">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(l => `<span>${l}</span>`).join('')}</div>
    <div class="h3-cal-grid">${cells.join('')}</div>
    <div class="h3-cal-month">${esc((t => t[0].toUpperCase() + t.slice(1))(now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })))}</div>
    <button type="button" class="h3-cal-foot" onclick="navigateTo('agenda')"><span>Hoje · ${nAg} ${nAg === 1 ? 'agendamento' : 'agendamentos'}</span><span aria-hidden="true">↗</span></button>`;
}
// Datas (YYYY-MM-DD) do mês com agendamento não cancelado
async function loadMonthAppointmentDays(year, month) {
  if (typeof currentUser === 'undefined' || !currentUser) return new Set();
  const pad = n => String(n).padStart(2, '0');
  const ini = `${year}-${pad(month + 1)}-01`, fim = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
  const { data, error } = await db('agendamentos').select('data,status').eq('user_id', currentUser.id).gte('data', ini).lte('data', fim);
  if (error || !data) return new Set();
  return new Set(data.filter(r => r.status !== 'cancelado').map(r => String(r.data).slice(0, 10)));
}
async function markCalendarDays() {
  const now = new Date();
  const dias = await loadMonthAppointmentDays(now.getFullYear(), now.getMonth());
  document.querySelectorAll('#content .h3-day[data-date]').forEach(el => el.classList.toggle('has-appt', dias.has(el.dataset.date)));
}

// Barras horizontais por categoria (substituem as roscas)
function catBarsHTML(items, opts = {}) {
  const rows = items.filter(i => i.value > 0);
  if (!rows.length) return `<div class="d2-empty">${esc(opts.empty || 'Nada neste período.')}</div>`;
  const max = opts.max || Math.max(...rows.map(r => r.value));
  const fmt = v => (opts.money === false ? String(v) : fCurrency(v));
  return `<ul class="cat-bars">${rows.map((r, i) => `<li>
      <div class="cat-bars-top"><span class="cat-bars-label">${esc(r.label)}</span><b>${fmt(r.value)}</b></div>
      <div class="cat-bars-track"><i style="width:${Math.max(2, Math.round(r.value / max * 100))}%;${i === 0 ? '' : 'opacity:.55'}"></i></div>
    </li>`).join('')}</ul>`;
}
function dashExpenseItems() {
  const { exits, clinic } = getData();
  const map = new Map();
  filterByPeriod(exits).forEach(x => { const k = EXIT_CATEGORIES[x.category] || 'Outros'; map.set(k, (map.get(k) || 0) + x.value); });
  filterClinicByPeriod(clinic).forEach(x => { const k = x.category === 'aluguel' ? 'Aluguel' : 'Consultório'; map.set(k, (map.get(k) || 0) + x.value); });
  const rows = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = rows.slice(0, 6).map(([label, value]) => ({ label, value }));
  if (rows.length > 6) top.push({ label: 'Outras', value: rows.slice(6).reduce((t, [, v]) => t + v, 0) });
  return top;
}

function renderDashboard() {
  const { entries } = getData();
  const { s, e } = getDateRange();
  const cur = dashTotals(s, e);
  const pr = dashPrevRange();
  const prev = dashTotals(pr.s, pr.e);
  const fe = filterByPeriod(entries).slice().sort((a, b) => b.date.localeCompare(a.date));
  const cmp = (c, p, money) => `${dashChip(c, p)}${p > 0 ? `<span>${esc(pr.label[0].toUpperCase() + pr.label.slice(1))}: ${money ? fCurrency(p) : p}</span>` : ''}`;

  return `
  ${dashHeroHTML()}
  <div class="d2-toolbar h3-toolbar">${periodFilterHTML()}</div>

  <section class="h3-row h3-top dash-anim">
    <article class="h3-card h3-fin">
      <div class="h3-card-head">
        <h3>Financeiro</h3>
        <label class="h3-select">
          <select aria-label="Período do gráfico" onchange="setDashChart(this.value)">
            ${[['semana', 'Esta semana'], ['6', 'Últimos 6 meses'], ['12', 'Últimos 12 meses']].map(([v, l]) => `<option value="${v}" ${dashChartMode() === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="h3-fin-body">
        <div class="h3-fin-nums">
          <span class="h3-big" data-count="${cur.lucro}" data-money="1">${fCurrency(cur.lucro)}</span>
          <span class="mono-label">Lucro líquido</span>
          <div class="h3-pair">
            <div><b>${fCurrency(cur.rev)}</b><span class="mono-label">Receita</span></div>
            <div><b>${fCurrency(cur.exp)}</b><span class="mono-label">Despesas</span></div>
          </div>
          <div class="h3-cmp">${cmp(cur.lucro, prev.lucro > 0 && cur.lucro > 0 ? prev.lucro : null, true)}</div>
        </div>
        <div class="h3-fin-chart"><canvas id="chartRevExp"></canvas></div>
      </div>
      <div class="rev-summary h3-rev-summary" id="revSummary"></div>
    </article>

    <article class="h3-card h3-att" role="link" tabindex="0" onclick="navigateTo('entradas')" onkeydown="if(event.key==='Enter')navigateTo('entradas')">
      <div class="h3-card-head"><h3>Atendimentos</h3><span class="mono-label">${esc(dashPeriodLabel())}</span></div>
      <div class="h3-att-num"><span class="h3-big" data-count="${cur.n}" data-money="0">${cur.n}</span><span class="mono-label">atendimentos registrados</span></div>
      <div class="h3-att-chart"><canvas id="chartAtend"></canvas></div>
      <div class="h3-cmp">${cmp(cur.n, prev.n, false)}</div>
    </article>

    <article class="h3-card h3-cal">${dashMiniCalHTML()}</article>
  </section>

  <section class="h3-row h3-bottom">
    <div class="d2-card">
      <div class="d2-card-head"><h3>Últimas entradas</h3><button class="pill-btn" onclick="navigateTo('entradas')">Ver todas</button></div>
      ${dashLastEntries(fe.slice(0, 5))}
    </div>
    <div class="d2-card">
      <div class="d2-card-head"><h3>Agenda e pendências</h3><button class="pill-btn" onclick="navigateTo('agenda')">Ver agenda</button></div>
      ${dashPendencias()}
    </div>
    <div class="d2-card">
      <div class="d2-card-head"><h3>Despesas por categoria</h3><button class="pill-btn" onclick="navigateTo('saidas')">Abrir</button></div>
      ${catBarsHTML(dashExpenseItems(), { empty: 'Sem despesas neste período.' })}
    </div>
  </section>`;
}
function dashPeriodLabel() {
  const p = state.filter.period;
  return { today: 'Hoje', week: 'Esta semana', month: 'Este mês', year: 'Este ano' }[p] || 'Período';
}

const dashInitials = n => (n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

function dashLastEntries(items) {
  if (!items.length) return `<div class="d2-empty">Nenhuma entrada neste período.<button class="d2-link" onclick="openEntradaModal()">Lançar entrada</button></div>`;
  return `<ul class="d2-list">${items.map(x => `
    <li class="d2-tx" onclick="openEntradaModal('${x.id}')" tabindex="0" onkeydown="if(event.key==='Enter')openEntradaModal('${x.id}')">
      <span class="d2-ava">${esc(dashInitials(x.clientName))}</span>
      <span class="d2-tx-main"><b>${esc(x.clientName || 'Paciente não informado')}</b><small>${esc(PROCEDURES[x.procedure] || x.procedure || '—')} · ${fDate(x.date)}</small></span>
      <span class="d2-tx-val">${fCurrency(x.value)}</span>
    </li>`).join('')}</ul>`;
}

function dashPendencias() {
  const rows = [];
  (typeof getTodayAppointments === 'function' ? getTodayAppointments() : []).forEach(a => rows.push({
    icon: iconCalendar(), title: `${a.procedimento || 'Consulta'} | ${a.horaInicio ? a.horaInicio.slice(0, 5) : '—'}`,
    sub: 'Hoje · ' + ((typeof AG_STATUS !== 'undefined' && AG_STATUS[a.status]?.label) || 'Agendado'), mid: 'Consulta', who: a.pacienteNome, go: "navigateTo('agenda')"
  }));
  (typeof getFollowupsDue === 'function' ? getFollowupsDue() : []).forEach(p => rows.push({
    icon: iconWhatsSmall(), title: `Follow-up | ${p.proximoContato < today() ? 'atrasado' : 'hoje'}`,
    sub: 'Combinado para ' + fDate(p.proximoContato), mid: (typeof CRM_STATUS !== 'undefined' && CRM_STATUS[p.status]?.label) || '', who: p.nome, go: "navigateTo('crm')", late: p.proximoContato < today()
  }));
  (typeof getUpcomingClinicPayments === 'function' ? getUpcomingClinicPayments() : []).forEach(c => rows.push({
    icon: iconDollar(), title: `${c.description} | ${fCurrency(c.value)}`,
    sub: c.diffDays === 0 ? 'Vence hoje' : `Vence em ${c.diffDays} dia${c.diffDays > 1 ? 's' : ''}`, mid: 'Conta do consultório', who: '', go: "navigateTo('consultorio')", late: c.diffDays === 0
  }));
  if (!rows.length) return `<div class="d2-empty">Nada pendente hoje. Agenda livre e follow-ups em dia.</div>`;
  return `<ul class="d2-list">${rows.slice(0, 5).map(r => `
    <li class="d2-req" onclick="${r.go}" tabindex="0" onkeydown="if(event.key==='Enter'){${r.go}}">
      <span class="d2-req-icon${r.late ? ' late' : ''}">${r.icon}</span>
      <span class="d2-req-main"><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></span>
      <span class="d2-req-mid">${esc(r.mid)}</span>
      ${r.who ? `<span class="d2-req-who"><span class="d2-ava sm">${esc(dashInitials(r.who))}</span>${esc(r.who)}</span>` : '<span class="d2-req-who"></span>'}
    </li>`).join('')}</ul>${rows.length > 5 ? `<div class="d2-more">+ ${rows.length - 5} pendência(s)</div>` : ''}`;
}
const iconWhatsSmall = () => svg('<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>');

/* ===== Gráficos ===== */
function initDashboardCharts() {
  applyChartTheme();
  applyCapa();
  renderRevChart();
  renderAttChart();
  markCalendarDays();
  animateDashboard();
  setTimeout(fitBigNumbers, 950); // depois da contagem animada
  fitBigNumbers();
}

// Números grandes diminuem a letra até caber no cartão (valores longos não são cortados)
function fitBigNumbers() {
  document.querySelectorAll('#content .h3-big').forEach(el => {
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth + 1 && size > 22) { size -= 2; el.style.fontSize = size + 'px'; }
  });
}

// Linha de atendimentos (entradas registradas) no período; por mês quando o período passa de 62 dias.
// Períodos curtos (hoje, semana) mostram pelo menos os últimos 14 dias, para a linha ter forma.
function renderAttChart() {
  if (!document.getElementById('chartAtend')) return;
  const { entries } = getData();
  let { s, e } = getDateRange();
  const DIA = 86400000;
  if ((e - s) / DIA < 13) s = new Date(e.getFullYear(), e.getMonth(), e.getDate() - 13);
  const porMes = (e - s) / DIA > 62;
  const buckets = [];
  if (porMes) {
    for (let d = new Date(s.getFullYear(), s.getMonth(), 1); d <= e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({ s: d, e: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59), label: MES_CURTO[d.getMonth()] });
    }
  } else {
    for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate()); d <= e; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      buckets.push({ s: d, e: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59), label: `${d.getDate()}/${d.getMonth() + 1}` });
    }
  }
  const values = buckets.map(b => entries.filter(x => { const d = new Date(x.date + 'T12:00:00'); return d >= b.s && d <= b.e; }).length);
  createChart('chartAtend', {
    type: 'line',
    data: { labels: buckets.map(b => b.label), datasets: [{ label: 'Atendimentos', data: values, borderColor: '#FBF6EE', borderWidth: 2, tension: .35, fill: false, pointRadius: 0, pointHoverRadius: 4, peakLabel: true, peakFormat: v => String(v) }] },
    options: {
      responsive: true, layout: { padding: { top: 26, right: 8 } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.raw} atendimento${c.raw === 1 ? '' : 's'}` } } },
      scales: { x: { display: false }, y: { display: false, beginAtZero: true } }
    }
  });
}

function dashChartMode() {
  if (!state.dashChart) { try { state.dashChart = localStorage.getItem('cf_dash_chart') || '6'; } catch (e) { state.dashChart = '6'; } }
  return ['semana', '6', '12'].includes(state.dashChart) ? state.dashChart : '6';
}
function setDashChart(v) {
  state.dashChart = v;
  try { localStorage.setItem('cf_dash_chart', v); } catch (e) {}
  renderRevChart();
}

function renderRevChart() {
  const canvas = document.getElementById('chartRevExp');
  if (!canvas) return;
  const { entries, exits, clinic, products } = getData();
  const mode = dashChartMode();
  const now = new Date();
  let labels, values, profits = null, ranges, hi, titles, parcial = false;

  if (mode === 'semana') {
    const dow = (now.getDay() + 6) % 7; // segunda = 0
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    ranges = dias.map((_, i) => { const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i); return { s: d, e: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59) }; });
    labels = dias;
    titles = ranges.map(r => r.s.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }));
    values = ranges.map(r => entries.filter(x => { const d = new Date(x.date + 'T12:00:00'); return d >= r.s && d <= r.e; }).reduce((t, x) => t + x.value, 0));
    hi = dow;
  } else {
    const n = Number(mode);
    const monthly = getMonthlyData(entries, exits, clinic, n, products);
    ranges = monthly.map((_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1); return { s: d, e: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }; });
    labels = ranges.map(r => MES_CURTO[r.s.getMonth()] + (r.s.getMonth() === 0 ? ' ' + String(r.s.getFullYear()).slice(2) : ''));
    titles = ranges.map(r => r.s.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
    values = monthly.map(m => m.revenue);
    profits = monthly.map(m => m.profit);
    hi = n - 1;
    parcial = now.getDate() < new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }

  // Resumo: melhor período, média e total (ignora períodos sem receita e o atual em andamento)
  const box = document.getElementById('revSummary');
  if (box) {
    const base = values.map((v, i) => ({ v, i })).filter(o => o.v > 0 && (mode === 'semana' ? o.i <= hi : !(parcial && o.i === hi)));
    if (base.length) {
      const best = base.reduce((b, o) => (o.v > b.v ? o : b), base[0]);
      const media = base.reduce((t, o) => t + o.v, 0) / base.length;
      const total = values.reduce((t, v) => t + v, 0);
      box.innerHTML = `
        <div class="rev-kpi"><span>${mode === 'semana' ? 'Melhor dia' : 'Melhor mês'}</span><b>${labels[best.i]} · ${fCompact(best.v)}</b></div>
        <div class="rev-kpi"><span>Média por ${mode === 'semana' ? 'dia' : 'mês'}</span><b>${fCompact(media)}</b></div>
        <div class="rev-kpi"><span>${mode === 'semana' ? 'Total na semana' : 'Lucro no período'}</span><b class="${(mode === 'semana' ? total : profits.reduce((t, v) => t + v, 0)) >= 0 ? 'pos' : 'neg'}">${fCompact(mode === 'semana' ? total : profits.reduce((t, v) => t + v, 0))}</b></div>`;
    } else box.innerHTML = '';
  }

  // Barras creme sobre o cartão laranja; o período atual em creme cheio
  const bg = values.map((_, i) => (i === hi ? '#FBF6EE' : 'rgba(251,246,238,.38)'));
  createChart('chartRevExp', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Receita', data: values, backgroundColor: bg, hoverBackgroundColor: values.map((_, i) => (i === hi ? '#FFFFFF' : 'rgba(251,246,238,.6)')), borderRadius: 6, borderSkipped: false, maxBarThickness: mode === '12' ? 12 : 16, categoryPercentage: 0.78, barPercentage: 0.92, minBarLength: 6 }] },
    options: {
      responsive: true,
      animation: { duration: 800, easing: 'easeOutQuart', delay: c => (c.type === 'data' && c.mode === 'default' ? c.dataIndex * 60 : 0) },
      onHover: (evt, els) => { if (evt.native?.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
      onClick: (evt, els) => {
        if (!els.length) return;
        const r = ranges[els[0].index];
        const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        state.filter = { period: 'custom', start: iso(r.s), end: iso(r.e) };
        saveFilter();
        navigateTo('entradas');
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#FBF6EE', titleColor: '#2E2A24', bodyColor: '#6F6558', footerColor: '#A85A1E',
          borderColor: '#E2D6C3', borderWidth: 1, padding: 12, cornerRadius: 12, displayColors: false, caretSize: 6,
          titleFont: { weight: '700', size: 13 }, bodyFont: { size: 12 }, footerFont: { weight: '700', size: 12 },
          callbacks: {
            title: items => fCurrency(items[0].raw),
            label: item => titles[item.dataIndex] + (mode !== 'semana' && parcial && item.dataIndex === hi ? ' (parcial)' : ''),
            footer: items => (profits ? `${profits[items[0].dataIndex] >= 0 ? 'Lucro' : 'Prejuízo'}: ${fCurrency(Math.abs(profits[items[0].dataIndex]))}` : '')
          }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(251,246,238,.75)', font: c => ({ family: "'IBM Plex Mono', monospace", size: 10, weight: c.index === hi ? '500' : '400' }) } },
        y: { display: false, beginAtZero: true }
      }
    }
  });
  // Deixa o balão aberto sobre o período em destaque, como na referência
  const chart = state.chartInstances.chartRevExp;
  if (chart && values[hi] > 0) setTimeout(() => {
    try { chart.tooltip.setActiveElements([{ datasetIndex: 0, index: hi }], { x: 0, y: 0 }); chart.update('none'); } catch (e) {}
  }, 950);
}

// Números contam do zero (respeita "reduzir movimento")
function animateDashboard() {
  setTimeout(() => document.querySelectorAll('#content .dash-anim').forEach(el => el.classList.add('is-in')), 40);
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('#content [data-count]').forEach(el => {
    const target = Number(el.dataset.count) || 0, money = el.dataset.money === '1';
    const t0 = performance.now(), dur = 900;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), v = target * (1 - Math.pow(1 - p, 3));
      el.textContent = money ? fCurrency(v) : Math.round(v);
      if (p < 1) requestAnimationFrame(step); else el.textContent = money ? fCurrency(target) : target;
    };
    requestAnimationFrame(step);
  });
}

/* ===== Topo: saudação no Dashboard ===== */
function updateTopbarTitle(view) {
  const sc = (typeof SCREENS !== 'undefined' && SCREENS[view]) || null;
  document.title = (sc ? sc.title + ' — ' : '') + 'ClinicFinance';
}

/* ===== Busca global (pacientes) ===== */
function globalSearch(q) {
  const box = document.getElementById('gsResults');
  if (!box) return;
  const term = crmNorm(q || '');
  const digits = (q || '').replace(/\D/g, '');
  if (term.length < 2 && digits.length < 3) { box.classList.remove('open'); box.innerHTML = ''; return; }
  const list = (state.data.crmPacientes || []).filter(p =>
    crmNorm(p.nome).includes(term) || (digits.length >= 3 && (p.telefone || '').replace(/\D/g, '').includes(digits))
  ).slice(0, 7);
  box.innerHTML = list.length
    ? list.map(p => `<button type="button" class="gs-item" onmousedown="event.preventDefault()" onclick="gsOpen('${p.id}')"><span class="d2-ava sm">${esc(dashInitials(p.nome))}</span><span><b>${esc(p.nome)}</b><small>${esc(p.telefone || '')}</small></span></button>`).join('')
    : `<div class="gs-empty">Nenhum paciente encontrado</div>`;
  box.classList.add('open');
}
function gsOpen(id) {
  const box = document.getElementById('gsResults'), inp = document.getElementById('gsInput');
  if (box) { box.classList.remove('open'); box.innerHTML = ''; }
  if (inp) inp.value = '';
  navigateTo('pacientes');
  const tryOpen = (n = 0) => {
    if (typeof _crm !== 'undefined' && _crm.pacientes.some(p => p.id === id)) openCrmDetail(id);
    else if (n < 30) setTimeout(() => tryOpen(n + 1), 150);
  };
  tryOpen();
}
function gsKey(ev) {
  if (ev.key === 'Escape') { ev.target.value = ''; globalSearch(''); ev.target.blur(); }
  if (ev.key === 'Enter') { const first = document.querySelector('#gsResults .gs-item'); if (first) first.click(); }
}
