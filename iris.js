/* ============================================================
   ClinicFinance — iris.js
   Íris (secretária com IA): view, abas e estado compartilhado.
   As abas Manual, Promoções e Configurações ficam em iris-manual.js.
   Tabelas: iris_config, iris_manual, iris_promocoes (ver iris.sql)
   ============================================================ */

/* ===== Estado ===== */
// tab padrão: manual enquanto Conversas é só um aviso (a etapa seguinte troca para 'conversas')
const _iris = { tab: 'manual', status: 'carregando', erro: '', config: null, manual: [], promocoes: [] };

const IRIS_TABS = [
  ['conversas', 'Conversas'],
  ['manual', 'Manual'],
  ['promocoes', 'Promoções'],
  ['config', 'Configurações']
];

/* ===== View principal ===== */
function renderIris() {
  setTimeout(() => irisCarregar(), 0);
  return `
  <div class="section-header">
    <div><div class="section-title">Íris</div><div class="section-sub">A secretária que responde às pacientes: o que ela pode dizer, promoções e horários</div></div>
  </div>
  <div class="subtabs iris-tabs" role="tablist" aria-label="Seções da Íris">
    ${IRIS_TABS.map(([k, label]) => `<button type="button" role="tab" class="subtab-btn ${_iris.tab === k ? 'active' : ''}" data-tab="${k}" aria-selected="${_iris.tab === k}" onclick="irisSetTab('${k}')">${label}</button>`).join('')}
  </div>
  <div id="irisBody" class="iris-body">${irisCarregando()}</div>`;
}

function irisSetTab(tab) {
  if (!IRIS_TABS.some(([k]) => k === tab)) return;
  _iris.tab = tab;
  document.querySelectorAll('.iris-tabs .subtab-btn').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  irisRenderBody();
}

/* ===== Carga ===== */
async function irisCarregar() {
  if (typeof currentUser === 'undefined' || !currentUser) {
    _iris.status = 'erro';
    _iris.erro = 'Faça login para ver a Íris.';
    irisRenderBody();
    return;
  }
  _iris.status = 'carregando';
  irisRenderBody();
  try {
    if (typeof irisGarantirPadrao === 'function') await irisGarantirPadrao();
    const uid = currentUser.id;
    const [c, m, p] = await Promise.all([
      db('iris_config').select('*').eq('user_id', uid).limit(1),
      db('iris_manual').select('*').eq('user_id', uid).order('ordem', { ascending: true }),
      db('iris_promocoes').select('*').eq('user_id', uid).order('valido_ate', { ascending: true })
    ]);
    const erro = c.error || m.error || p.error;
    if (erro) throw erro;
    _iris.config = (c.data || [])[0] || null;
    _iris.manual = (m.data || []).slice().sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
    _iris.promocoes = p.data || [];
    _iris.status = 'pronto';
  } catch (e) {
    console.error('Íris: erro ao carregar', e);
    _iris.status = 'erro';
    _iris.erro = irisMsgErro(e);
  }
  irisRenderBody();
}

// texto para quem usa o app (não técnico)
function irisMsgErro(e) {
  const txt = String(e?.message || e || '');
  if (e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|schema cache/i.test(txt)) {
    return 'As tabelas da Íris ainda não foram criadas no banco de dados. Avise o suporte para rodar a instalação da Íris.';
  }
  return 'Não foi possível falar com o banco de dados. Confira a internet e tente de novo.';
}

/* ===== Corpo (aba atual) ===== */
function irisRenderBody() {
  const el = document.getElementById('irisBody');
  if (!el || state.currentView !== 'iris') return;
  if (_iris.tab === 'conversas') { el.innerHTML = irisTabConversas(); return; }
  if (_iris.status === 'carregando') { el.innerHTML = irisCarregando(); return; }
  if (_iris.status === 'erro') { el.innerHTML = irisErro(_iris.erro); return; }
  const tabs = {
    manual:    typeof irisTabManual === 'function' ? irisTabManual : null,
    promocoes: typeof irisTabPromocoes === 'function' ? irisTabPromocoes : null,
    config:    typeof irisTabConfig === 'function' ? irisTabConfig : null
  };
  const fn = tabs[_iris.tab];
  el.innerHTML = fn ? fn() : '';
  setTimeout(initDatePickers, 10);
}

/* ===== Estados compartilhados ===== */
function irisCarregando() {
  return `<div class="iris-state" role="status"><span class="iris-spinner" aria-hidden="true"></span>Carregando…</div>`;
}
function irisErro(msg) {
  return `<div class="iris-state iris-state--erro" role="alert">
    <h3>Não foi possível abrir a Íris</h3>
    <p>${esc(msg)}</p>
    <button type="button" class="btn btn-secondary" onclick="irisCarregar()">Tentar de novo</button>
  </div>`;
}
function irisTabConversas() {
  return `<div class="iris-state iris-state--vazio">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    <p>As conversas aparecem aqui na próxima etapa.</p>
  </div>`;
}
