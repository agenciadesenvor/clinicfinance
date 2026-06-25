/* ============================================================
   ClinicFinance — ai.js
   Módulo de IA com Claude API (Anthropic)
   ============================================================ */

let _aiCurrentTab = 'insights';

/* ===== PANEL TOGGLE ===== */
function toggleAiPanel() {
  const panel = document.getElementById('aiPanel');
  if (!panel) return;
  if (panel.classList.contains('open')) {
    closeAiPanel();
  } else {
    openAiPanel();
  }
}

function openAiPanel() {
  const panel   = document.getElementById('aiPanel');
  const overlay = document.getElementById('aiOverlay');
  if (!panel) return;
  panel.classList.add('open');
  if (overlay) overlay.classList.add('open');
  renderAiTab(_aiCurrentTab);
}

function closeAiPanel() {
  const panel   = document.getElementById('aiPanel');
  const overlay = document.getElementById('aiOverlay');
  if (panel)   panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function setAiTab(tab) {
  _aiCurrentTab = tab;
  document.querySelectorAll('.ai-tab').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === tab)
  );
  renderAiTab(tab);
}

/* ===== TAB RENDERERS ===== */
function renderAiTab(tab) {
  const body = document.getElementById('aiPanelBody');
  if (!body) return;

  if (tab === 'insights') {
    body.innerHTML = `
      <div class="ai-tab-content">
        <p class="ai-intro">Receba uma análise inteligente dos seus dados financeiros do período atual com recomendações personalizadas.</p>
        <button class="ai-action-btn" onclick="runInsights()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          Analisar meu negócio
        </button>
        <div class="ai-response" id="aiResponse"></div>
      </div>`;

  } else if (tab === 'preco') {
    body.innerHTML = `
      <div class="ai-tab-content">
        <p class="ai-intro">Informe os dados do procedimento e receba sugestões de preço com margens ideais para seu mercado.</p>
        <div class="ai-form">
          <div class="form-group">
            <label class="form-label">Procedimento</label>
            <input type="text" class="form-control" id="aiProc" placeholder="Ex: Botox, Harmonização Facial…" />
          </div>
          <div class="form-group">
            <label class="form-label">Custo dos insumos (R$)</label>
            <input type="number" class="form-control" id="aiInsumos" placeholder="0,00" step="0.01" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Horas trabalhadas</label>
            <input type="number" class="form-control" id="aiHoras" placeholder="Ex: 1.5" step="0.5" min="0.5" value="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Despesas fixas do mês (R$)</label>
            <input type="number" class="form-control" id="aiFixo" placeholder="Ex: 3500,00" step="0.01" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Procedimentos realizados no mês</label>
            <input type="number" class="form-control" id="aiQtd" placeholder="Ex: 20" min="1" value="20" />
          </div>
          <button class="ai-action-btn" onclick="runPrecificacao()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
            Sugerir preço
          </button>
        </div>
        <div class="ai-response" id="aiResponse"></div>
      </div>`;

  } else if (tab === 'relatorio') {
    body.innerHTML = `
      <div class="ai-tab-content">
        <p class="ai-intro">Gere um resumo executivo completo do mês atual com análise de desempenho e tendências.</p>
        <button class="ai-action-btn" onclick="runRelatorio()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Gerar resumo do mês
        </button>
        <div class="ai-response" id="aiResponse"></div>
      </div>`;
  }
}

/* ===== FINANCIAL CONTEXT BUILDER ===== */
function getFinancialContext() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const startOfMonth    = new Date(y, m, 1);
  const endOfMonth      = new Date(y, m + 1, 0, 23, 59, 59);
  const startOfLastMonth = new Date(y, m - 1, 1);
  const endOfLastMonth   = new Date(y, m, 0, 23, 59, 59);

  const inRange = (dateStr, s, e) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d >= s && d <= e;
  };

  const { entries, exits, clinic } = state.data;

  const thisEntries = entries.filter(e => inRange(e.date, startOfMonth, endOfMonth));
  const lastEntries = entries.filter(e => inRange(e.date, startOfLastMonth, endOfLastMonth));
  const thisExits   = exits.filter(e  => inRange(e.date, startOfMonth, endOfMonth));
  const lastExits   = exits.filter(e  => inRange(e.date, startOfLastMonth, endOfLastMonth));
  const thisClinic  = clinic.filter(e => inRange(e.date, startOfMonth, endOfMonth));

  const thisRevenue  = thisEntries.reduce((s, e) => s + e.value, 0);
  const lastRevenue  = lastEntries.reduce((s, e) => s + e.value, 0);
  const thisExpenses = thisExits.reduce((s, e) => s + e.value, 0)
                     + thisClinic.reduce((s, e) => s + e.value, 0);
  const lastExpenses = lastExits.reduce((s, e) => s + e.value, 0);
  const thisProfit   = thisRevenue - thisExpenses;

  // Procedimentos breakdown
  const procBreakdown = {};
  thisEntries.forEach(e => {
    if (!e.procedure) return;
    if (!procBreakdown[e.procedure]) procBreakdown[e.procedure] = { count: 0, revenue: 0 };
    procBreakdown[e.procedure].count++;
    procBreakdown[e.procedure].revenue += e.value;
  });

  // Dia da semana com mais receita
  const dayBreakdown = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
  thisEntries.forEach(e => {
    const d = new Date(e.date + 'T12:00:00');
    dayBreakdown[d.getDay()] += e.value;
  });

  const monthName = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return {
    monthName,
    thisMonth: {
      revenue:        thisRevenue,
      expenses:       thisExpenses,
      profit:         thisProfit,
      margin:         thisRevenue > 0 ? ((thisProfit / thisRevenue) * 100).toFixed(1) : '0',
      procedureCount: thisEntries.length,
      procedures:     procBreakdown
    },
    lastMonth: {
      revenue:  lastRevenue,
      expenses: lastExpenses,
      profit:   lastRevenue - lastExpenses
    },
    dayBreakdown
  };
}

/* ===== CLAUDE API CALL ===== */
async function callClaude(userMessage, systemPrompt) {
  if (!window.ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'sua-chave-aqui') {
    return { error: 'Chave da API Anthropic não configurada. Substitua "sua-chave-aqui" em config.js pela sua chave de https://console.anthropic.com/' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: err.error?.message || `Erro HTTP ${response.status}` };
    }

    const data = await response.json();
    return { text: data.content?.[0]?.text || '' };

  } catch (e) {
    return { error: 'Erro de conexão: ' + e.message };
  }
}

/* ===== UI HELPERS ===== */
function showAiLoading() {
  const el = document.getElementById('aiResponse');
  if (!el) return;
  el.innerHTML = `
    <div class="ai-loading">
      <div class="ai-loading-dots">
        <span></span><span></span><span></span>
      </div>
      <p>Analisando seus dados…</p>
    </div>`;
}

function showAiError(msg) {
  const el = document.getElementById('aiResponse');
  if (!el) return;
  el.innerHTML = `<div class="ai-error">⚠️ ${msg}</div>`;
}

function typewriterEffect(el, text, speed = 10) {
  el.innerHTML = '';
  // Convert basic markdown to HTML
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*)/gm, '<h4>$1</h4>')
    .replace(/^## (.*)/gm, '<h3>$1</h3>')
    .replace(/^# (.*)/gm, '<h3>$1</h3>')
    .replace(/^- (.*)/gm, '• $1')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');

  const chars = formatted.split('');
  let i = 0;
  const interval = setInterval(() => {
    if (i < chars.length) {
      el.innerHTML = formatted.slice(0, i + 1);
      i++;
    } else {
      clearInterval(interval);
    }
  }, speed);
}

/* ===== AI ACTIONS ===== */
const fR = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

async function runInsights() {
  showAiLoading();
  const ctx = getFinancialContext();

  const procText = Object.entries(ctx.thisMonth.procedures)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([k, v]) => `- ${k}: ${v.count} atendimento${v.count !== 1 ? 's' : ''}, ${fR(v.revenue)}`)
    .join('\n') || '- Nenhum procedimento registrado neste período';

  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const bestDayEntry = Object.entries(ctx.dayBreakdown).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const bestDay = bestDayEntry[1] > 0
    ? `${dayNames[bestDayEntry[0]]} (${fR(bestDayEntry[1])})`
    : 'Sem registros suficientes';

  const revenueChange = ctx.lastMonth.revenue > 0
    ? (((ctx.thisMonth.revenue - ctx.lastMonth.revenue) / ctx.lastMonth.revenue) * 100).toFixed(1)
    : null;

  const prompt = `Análise financeira para ${ctx.monthName}:

**Receita:** ${fR(ctx.thisMonth.revenue)} ${revenueChange !== null ? `(${revenueChange > 0 ? '+' : ''}${revenueChange}% vs mês anterior: ${fR(ctx.lastMonth.revenue)})` : ''}
**Despesas:** ${fR(ctx.thisMonth.expenses)} (mês anterior: ${fR(ctx.lastMonth.expenses)})
**Lucro líquido:** ${fR(ctx.thisMonth.profit)}
**Margem:** ${ctx.thisMonth.margin}%
**Total de atendimentos:** ${ctx.thisMonth.procedureCount}

**Procedimentos realizados:**
${procText}

**Dia da semana com mais receita:** ${bestDay}

Forneça uma análise completa com:
1. 🏆 Procedimento mais lucrativo e por quê vale focar nele
2. 📅 Análise do melhor dia da semana (estratégia de agenda)
3. 📊 Comparação com mês anterior — destaque positivo ou alerta
4. ⚠️ Alerta se despesas subiram mais de 20% vs mês anterior
5. 💡 Top 3 recomendações práticas e específicas para aumentar lucro

Use linguagem direta, emojis e seja objetiva. Máximo 350 palavras.`;

  const { text, error } = await callClaude(prompt,
    'Você é uma consultora financeira especialista em clínicas de estética. Responda sempre em português brasileiro, de forma prática, direta e motivadora. Use emojis com moderação.');

  if (error) { showAiError(error); return; }

  const el = document.getElementById('aiResponse');
  if (el) {
    el.innerHTML = '<div class="ai-result"></div>';
    typewriterEffect(el.querySelector('.ai-result'), text);
  }
}

async function runPrecificacao() {
  const proc    = document.getElementById('aiProc')?.value.trim();
  const insumos = parseFloat(document.getElementById('aiInsumos')?.value) || 0;
  const horas   = parseFloat(document.getElementById('aiHoras')?.value)   || 1;
  const fixo    = parseFloat(document.getElementById('aiFixo')?.value)    || 0;
  const qtd     = parseInt(document.getElementById('aiQtd')?.value)       || 20;

  if (!proc) { showAiError('Informe o nome do procedimento para continuar.'); return; }

  showAiLoading();

  const custoFixoPorProc = qtd > 0 ? fixo / qtd : 0;
  const custoTotal       = insumos + custoFixoPorProc;

  const prompt = `Precificação para procedimento estético:

**Procedimento:** ${proc}
**Custo de insumos:** ${fR(insumos)}
**Horas trabalhadas:** ${horas}h
**Rateio de despesas fixas:** ${fR(fixo)} ÷ ${qtd} procedimentos = ${fR(custoFixoPorProc)}/procedimento
**Custo total por procedimento:** ${fR(custoTotal)}

Calcule e apresente claramente:
1. **Preço Mínimo** — cobre todos os custos sem lucro
2. **Preço Ideal** — com 60% de margem de lucro
3. **Preço Premium** — com 75% de margem de lucro

Em seguida, escreva 2-3 parágrafos de justificativa considerando:
- Contexto do mercado de estética no Brasil
- Percepção de valor do procedimento
- Estratégia de posicionamento

Seja objetiva, use valores em R$ e formate os preços em destaque com negrito.`;

  const { text, error } = await callClaude(prompt,
    'Você é especialista em precificação para clínicas de estética no Brasil. Calcule com precisão e explique com clareza. Responda em português brasileiro.');

  if (error) { showAiError(error); return; }

  const el = document.getElementById('aiResponse');
  if (el) {
    el.innerHTML = '<div class="ai-result"></div>';
    typewriterEffect(el.querySelector('.ai-result'), text);
  }
}

async function runRelatorio() {
  showAiLoading();
  const ctx = getFinancialContext();

  const procText = Object.entries(ctx.thisMonth.procedures)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([k, v]) => `${k} (${v.count}x, ${fR(v.revenue)})`)
    .join(', ') || 'nenhum procedimento registrado';

  const maisLucrativo = Object.entries(ctx.thisMonth.procedures)
    .sort((a, b) => b[1].revenue - a[1].revenue)[0];

  const revenueChange = ctx.lastMonth.revenue > 0
    ? (((ctx.thisMonth.revenue - ctx.lastMonth.revenue) / ctx.lastMonth.revenue) * 100).toFixed(1)
    : null;

  const prompt = `Gere um relatório executivo mensal em português brasileiro para ${ctx.monthName}:

**Dados completos:**
- Receita: ${fR(ctx.thisMonth.revenue)}
- Despesas: ${fR(ctx.thisMonth.expenses)}
- Lucro líquido: ${fR(ctx.thisMonth.profit)}
- Margem: ${ctx.thisMonth.margin}%
- Atendimentos: ${ctx.thisMonth.procedureCount}
- Procedimentos: ${procText}
- Procedimento mais lucrativo: ${maisLucrativo ? `${maisLucrativo[0]} (${fR(maisLucrativo[1].revenue)})` : 'não identificado'}
- Mês anterior: receita ${fR(ctx.lastMonth.revenue)}, lucro ${fR(ctx.lastMonth.profit)}
- Variação de receita: ${revenueChange !== null ? revenueChange + '%' : 'sem dados anteriores'}

Escreva um parágrafo executivo de 3-4 frases em estilo profissional mas acessível. Use "você" para se dirigir à proprietária. Inclua: os números mais relevantes, o procedimento destaque, comparação com mês anterior e uma avaliação da saúde financeira.

Formato: apenas o parágrafo, sem títulos ou listas. Tom: encorajador e factual.`;

  const { text, error } = await callClaude(prompt,
    'Você é redatora sênior de relatórios financeiros para pequenos negócios de estética. Escreva em português brasileiro, tom profissional e acolhedor.');

  if (error) { showAiError(error); return; }

  const el = document.getElementById('aiResponse');
  if (el) {
    el.innerHTML = '<div class="ai-result ai-result-report"></div>';
    typewriterEffect(el.querySelector('.ai-result'), text, 8);
  }
}
