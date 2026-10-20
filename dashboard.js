/* ============================================================
   ClinicFinance — dashboard.js
   Dashboard no layout "Paperpillar" (referência Figma), nas cores
   da clínica: 3 indicadores com comparação ao período anterior,
   gráfico de receita (dia em destaque listrado), rosca de despesas,
   últimas entradas e agenda/pendências do dia.
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

/* ===== Tela ===== */
function renderDashboard() {
  const { entries } = getData();
  const { s, e } = getDateRange();
  const cur = dashTotals(s, e);
  const pr = dashPrevRange();
  const prev = dashTotals(pr.s, pr.e);
  const fe = filterByPeriod(entries).slice().sort((a, b) => b.date.localeCompare(a.date));

  return `
  <div class="d2-toolbar">
    ${periodFilterHTML()}
    <button class="btn btn-primary d2-new" onclick="openEntradaModal()">${iconPlus()} Nova entrada</button>
  </div>

  <section class="d2-kpis dash-anim">
    ${dashKpi({ icon: iconTrend(), tone: 'sage', title: 'Receita', value: cur.rev, money: true, cur: cur.rev, prev: prev.rev, prevLabel: pr.label, go: 'entradas' })}
    ${dashKpi({ icon: iconClip(), tone: 'stone', title: 'Atendimentos', value: cur.n, money: false, cur: cur.n, prev: prev.n, prevLabel: pr.label, go: 'entradas' })}
    ${dashKpi({ icon: iconDollar(), tone: 'sand', title: 'Lucro líquido', value: cur.lucro, money: true, cur: cur.lucro, prev: prev.lucro > 0 && cur.lucro > 0 ? prev.lucro : null, prevLabel: pr.label, go: 'graficos' })}
  </section>

  <section class="d2-row d2-row-a">
    <div class="d2-card d2-report">
      <div class="d2-card-head">
        <h3>Receita</h3>
        <label class="d2-select">${iconCalendar()}
          <select aria-label="Período do gráfico" onchange="setDashChart(this.value)">
            ${[['semana', 'Esta semana'], ['6', 'Últimos 6 meses'], ['12', 'Últimos 12 meses']].map(([v, l]) => `<option value="${v}" ${dashChartMode() === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="rev-summary" id="revSummary"></div>
      <div class="d2-chart"><canvas id="chartRevExp"></canvas></div>
    </div>
    <div class="d2-card d2-cost">
      <div class="d2-card-head"><h3>Despesas</h3><button class="d2-link" onclick="navigateTo('saidas')">Ver detalhes</button></div>
      <div id="costBox"></div>
    </div>
  </section>

  <section class="d2-row d2-row-b">
    <div class="d2-card">
      <div class="d2-card-head"><h3>Últimas entradas</h3><button class="d2-link" onclick="navigateTo('entradas')">Ver todas</button></div>
      ${dashLastEntries(fe.slice(0, 5))}
    </div>
    <div class="d2-card">
      <div class="d2-card-head"><h3>Agenda e pendências</h3><button class="d2-link" onclick="navigateTo('agenda')">Ver agenda</button></div>
      ${dashPendencias()}
    </div>
  </section>`;
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
  renderRevChart();
  renderCostChart();
  animateDashboard();
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

// Padrão listrado (dia/mês em destaque), como na referência
function hatchPattern(ctx) {
  const c = document.createElement('canvas'); c.width = c.height = 10;
  const g = c.getContext('2d');
  g.fillStyle = '#6E5749'; g.fillRect(0, 0, 10, 10);
  g.strokeStyle = 'rgba(255,253,249,.28)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-2, 12); g.lineTo(12, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(8, 12); g.lineTo(12, 8); g.stroke();
  return ctx.createPattern(c, 'repeat');
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

  const ctx = canvas.getContext('2d');
  const pat = hatchPattern(ctx);
  const bg = values.map((_, i) => (i === hi ? pat : '#EFE4D3'));
  createChart('chartRevExp', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Receita', data: values, backgroundColor: bg, hoverBackgroundColor: values.map((_, i) => (i === hi ? pat : '#E2D2BA')), borderRadius: 12, borderSkipped: false, maxBarThickness: mode === '12' ? 30 : 54, categoryPercentage: 0.78, barPercentage: 0.92, minBarLength: 6 }] },
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
          backgroundColor: '#FFFDF9', titleColor: '#33291F', bodyColor: '#76695C', footerColor: '#7F6658',
          borderColor: '#EFE7DA', borderWidth: 1, padding: 12, cornerRadius: 12, displayColors: false, caretSize: 6,
          titleFont: { weight: '700', size: 13 }, bodyFont: { size: 12 }, footerFont: { weight: '700', size: 12 },
          callbacks: {
            title: items => fCurrency(items[0].raw),
            label: item => titles[item.dataIndex] + (mode !== 'semana' && parcial && item.dataIndex === hi ? ' (parcial)' : ''),
            footer: items => (profits ? `${profits[items[0].dataIndex] >= 0 ? 'Lucro' : 'Prejuízo'}: ${fCurrency(Math.abs(profits[items[0].dataIndex]))}` : '')
          }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: '#8A7D70', font: c => ({ size: 12, weight: c.index === hi ? '700' : '400' }) } },
        y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(127,102,88,0.12)', borderDash: [4, 4], tickBorderDash: [4, 4] }, ticks: { callback: v => fCompact(v), maxTicksLimit: 5, color: '#8A7D70' } }
      }
    }
  });
  // Deixa o balão aberto sobre o período em destaque, como na referência
  const chart = state.chartInstances.chartRevExp;
  if (chart && values[hi] > 0) setTimeout(() => {
    try { chart.tooltip.setActiveElements([{ datasetIndex: 0, index: hi }], { x: 0, y: 0 }); chart.update('none'); } catch (e) {}
  }, 950);
}

function renderCostChart() {
  const box = document.getElementById('costBox');
  if (!box) return;
  const { exits, clinic } = getData();
  const fx = filterByPeriod(exits), fc = filterClinicByPeriod(clinic);
  const map = new Map();
  fx.forEach(x => { const k = EXIT_CATEGORIES[x.category] || 'Outros'; map.set(k, (map.get(k) || 0) + x.value); });
  fc.forEach(x => { const k = x.category === 'aluguel' ? 'Aluguel' : 'Consultório'; map.set(k, (map.get(k) || 0) + x.value); });
  const rows = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((t, [, v]) => t + v, 0);
  if (!rows.length) { box.innerHTML = `<div class="d2-empty">Sem despesas neste período.</div>`; return; }
  const cores = ['#A8BBA0', '#E3D3B5', '#C9D6D3', '#BDB9D3', '#D9B8A6', '#CBBBA9', '#B9C7D1'];
  const top = rows.slice(0, 6);
  if (rows.length > 6) top.push(['Outros', rows.slice(6).reduce((t, [, v]) => t + v, 0)]);
  box.innerHTML = `<div class="d2-cost-body">
    <div class="d2-donut"><canvas id="chartCost"></canvas><div class="d2-donut-center"><b>${fCompact(total)}</b><span>no período</span></div></div>
    <ul class="d2-legend">${top.map(([k, v], i) => `<li><i style="background:${cores[i % cores.length]}"></i><span>${esc(k)}</span><b>${fCompact(v)}</b></li>`).join('')}</ul>
  </div>`;
  createChart('chartCost', {
    type: 'doughnut',
    data: { labels: top.map(([k]) => k), datasets: [{ data: top.map(([, v]) => v), backgroundColor: top.map((_, i) => cores[i % cores.length]), borderWidth: 4, borderColor: '#FFFDF9', borderRadius: 6, hoverOffset: 6 }] },
    options: { responsive: true, cutout: '58%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fCurrency(c.raw)} (${Math.round(c.raw / total * 100)}%)` } } } }
  });
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
function updateTopbarTitle(view, fallback) {
  const el = document.getElementById('pageTitle');
  if (!el) return;
  const left = el.closest('.topbar-left');
  if (view === 'dashboard') {
    const nome = (typeof currentProfile !== 'undefined' && currentProfile?.first_name) ? currentProfile.first_name.split(' ')[0] : '';
    const h = new Date().getHours();
    const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    el.innerHTML = `<span class="tb-hello">${saud}${nome ? ', ' + esc(nome) : ''}!</span><span class="tb-sub">Veja o movimento do consultório hoje, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</span>`;
    left?.classList.add('is-hello');
  } else {
    el.textContent = fallback;
    left?.classList.remove('is-hello');
  }
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
