/* ============================================================
   ClinicFinance — app.js
   Credenciais em config.js (carregado antes deste script)
   ============================================================ */

/* ===== SUPABASE CLIENT (somente para AUTH) ===== */
let sb = null;
try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession:     true,
      autoRefreshToken:   true,
      detectSessionInUrl: true,
      storageKey:         'clinic-finance-auth',
      lock: (_n, _t, fn) => fn()  // bypass Web Lock
    }
  });
} catch(e) { console.error('Supabase init:', e); }

let currentUser      = null;
let currentProfile   = {};
let _accessToken     = null; // token armazenado para usar no db()
let _loadController  = null; // AbortController para cancelar loadAllData em andamento
let _appShown        = false; // garante que showApp/nav só roda uma vez

/* ===== DB() — fetch direto sem Web Lock ===== */
// Substitui db() para operações de banco (não-auth)
// Evita completamente o bug de deadlock do Supabase JS client
function db(table, signal) {
  const base = `${SUPABASE_URL}/rest/v1/${table}`;
  const headers = () => ({
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${_accessToken || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  });
  const sig = signal ? { signal } : {};

  return {
    // SELECT
    select(cols = '*') {
      let _filters = [], _order = null, _limit = null, _single = false;
      const q = {
        eq(col, val)        { _filters.push(`${col}=eq.${encodeURIComponent(val)}`); return q; },
        order(col, opts)    { _order = `${col}.${opts?.ascending === false ? 'desc' : 'asc'}`; return q; },
        limit(n)            { _limit = n; return q; },
        single()            { _single = true; return q; },
        async then(resolve) {
          let url = `${base}?select=${cols}`;
          if (_filters.length) url += '&' + _filters.join('&');
          if (_order) url += `&order=${_order}`;
          if (_limit) url += `&limit=${_limit}`;
          const hdrs = { ...headers() };
          if (_single) hdrs['Accept'] = 'application/vnd.pgrst.object+json';
          try {
            const r = await fetch(url, { headers: hdrs, ...sig });
            if (!r.ok) { const e = await r.json().catch(()=>({message:r.statusText})); resolve({ data: _single?null:[], error: e }); return; }
            const data = await r.json();
            resolve({ data, error: null });
          } catch(e) {
            if (e.name === 'AbortError') { resolve({ data: _single?null:[], error: null }); return; }
            resolve({ data: _single?null:[], error: { message: e.message } });
          }
        }
      };
      return q;
    },
    // INSERT
    async insert(rows) {
      const body = Array.isArray(rows) ? rows : [rows];
      try {
        const r = await fetch(base, { method: 'POST', headers: { ...headers(), 'Prefer': 'return=minimal' }, body: JSON.stringify(body) });
        if (!r.ok) { const e = await r.json().catch(()=>({message:r.statusText})); return { data: null, error: e }; }
        return { data: null, error: null };
      } catch(e) { return { data: null, error: { message: e.message } }; }
    },
    // UPDATE
    update(payload) {
      let _filters = [];
      const q = {
        eq(col, val) { _filters.push(`${col}=eq.${encodeURIComponent(val)}`); return q; },
        async then(resolve) {
          const url = `${base}?${_filters.join('&')}`;
          try {
            const r = await fetch(url, { method: 'PATCH', headers: { ...headers(), 'Prefer': 'return=minimal' }, body: JSON.stringify(payload) });
            if (!r.ok) { const e = await r.json().catch(()=>({message:r.statusText})); resolve({ data: null, error: e }); return; }
            resolve({ data: null, error: null });
          } catch(e) { resolve({ data: null, error: { message: e.message } }); }
        }
      };
      return q;
    },
    // UPSERT
    async upsert(rows, opts = {}) {
      const body = Array.isArray(rows) ? rows : [rows];
      const prefer = `resolution=merge-duplicates,return=representation`;
      const onConflict = opts.onConflict ? `?on_conflict=${opts.onConflict}` : '';
      try {
        const r = await fetch(`${base}${onConflict}`, { method: 'POST', headers: { ...headers(), 'Prefer': prefer }, body: JSON.stringify(body) });
        if (!r.ok) { const e = await r.json().catch(()=>({message:r.statusText})); return { data: null, error: e }; }
        return { data: await r.json(), error: null };
      } catch(e) { return { data: null, error: { message: e.message } }; }
    },
    // DELETE
    delete() {
      let _filters = [];
      const q = {
        eq(col, val) { _filters.push(`${col}=eq.${encodeURIComponent(val)}`); return q; },
        async then(resolve) {
          const url = `${base}?${_filters.join('&')}`;
          try {
            const r = await fetch(url, { method: 'DELETE', headers: headers() });
            if (!r.ok) { const e = await r.json().catch(()=>({message:r.statusText})); resolve({ data: null, error: e }); return; }
            resolve({ data: null, error: null });
          } catch(e) { resolve({ data: null, error: { message: e.message } }); }
        }
      };
      return q;
    }
  };
}

/* ===== LOADING OVERLAY ===== */
function showLoading(msg = 'Carregando…') {
  const msgEl = document.getElementById('loadingMsg');
  const ovEl  = document.getElementById('loadingOverlay');
  if (msgEl) msgEl.textContent = msg;
  if (ovEl)  ovEl.classList.add('visible');
}
function hideLoading() {
  const ovEl = document.getElementById('loadingOverlay');
  if (ovEl) ovEl.classList.remove('visible');
}

/* ===== SHOW / HIDE APP ===== */
function showApp() {
  const loading = document.getElementById('authLoading');
  const content = document.getElementById('content');
  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';
}
function showAuth() {
  // Redireciona para a tela de login separada
  window.location.replace('auth.html');
}

async function handleLogout() {
  if (!confirm('Deseja sair da sua conta?')) return;
  localStorage.removeItem('clinic-finance-auth');  // remove sessão imediatamente
  if (sb) sb.auth.signOut().catch(() => {});        // tenta signOut em background
  window.location.replace('auth.html');             // redireciona sem esperar
}

/* ===== PERFIL UI ===== */
function updateSidebarProfile() {
  const firstName = currentProfile.first_name || '';
  const lastName  = currentProfile.last_name  || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ') || currentUser?.email?.split('@')[0] || '…';
  const specialty = currentProfile.specialty  || 'Biomédica Esteta';
  const avatar    = currentProfile.avatar_data || '';
  const initials  = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase() || '?';

  const nameEl    = document.getElementById('sidebarName');
  const roleEl    = document.getElementById('sidebarRole');
  const avatarEl  = document.getElementById('sidebarAvatar');
  if (nameEl)   nameEl.textContent   = fullName;
  if (roleEl)   roleEl.textContent   = specialty;
  if (avatarEl) {
    if (avatar) {
      avatarEl.innerHTML = `<img src="${avatar}" alt="foto" />`;
    } else {
      avatarEl.textContent = initials;
    }
  }
  updateTopbarAvatar();
}

/* ===== DATA MAPPERS (DB snake_case → JS camelCase) ===== */
const mapEntry = r => ({
  id: r.id, date: r.date,
  clientName:  r.client_name,
  procedure:   r.procedure,
  value:       Number(r.value || 0),
  payment:     r.payment,
  photoBefore: r.photo_before || null,
  photoAfter:  r.photo_after  || null
});
const mapExit = r => ({
  id: r.id, date: r.date, category: r.category,
  description: r.description, value: Number(r.value || 0)
});
const mapProduct = r => ({
  id: r.id, name: r.name, category: r.category, supplier: r.supplier,
  qty:            Number(r.qty            || 1),
  unitCost:       Number(r.unit_cost      || 0),
  totalCost:      Number(r.total_cost     || 0),
  procedure:      r.procedure,
  procedurePrice: Number(r.procedure_price|| 0),
  notes:          r.notes
});
const mapClinic = r => ({
  id: r.id, date: r.date, category: r.category,
  description: r.description, value: Number(r.value || 0), recurrence: r.recurrence
});
const mapNota = r => ({
  id: r.id, date: r.date, number: r.number, supplier: r.supplier,
  description: r.description, value: Number(r.value || 0),
  notes: r.notes, fileData: r.file_data
});
const mapPricing = r => ({
  id: r.id, procedure: r.procedure,
  targetPrice:   Number(r.target_price   || 0),
  minPrice:      Number(r.min_price      || 0),
  estimatedTime: Number(r.estimated_time || 60),
  notes: r.notes || ''
});
const mapPricingInsumo = r => ({
  id: r.id, precificacaoId: r.precificacao_id,
  produtoId: r.produto_id, qtyUsed: Number(r.qty_used || 1)
});
const mapEntradaInsumo = r => ({
  id: r.id, entradaId: r.entrada_id,
  produtoId: r.produto_id, qtyUsed: Number(r.qty_used || 1),
  unitCost: Number(r.unit_cost || 0)
});

/* Mappers — nova precificação calculadora */
const mapPrecFull = r => ({
  id: r.id, procedure: r.procedure,
  durationMin: Number(r.duration_min || 0), hourlyRate: Number(r.hourly_rate || 0),
  laborCost: Number(r.labor_cost || 0), productsCost: Number(r.products_cost || 0),
  suppliesCost: Number(r.supplies_cost || 0), fixedCost: Number(r.fixed_cost || 0),
  totalCost: Number(r.total_cost || 0), marginPct: Number(r.margin_pct || 0),
  suggestedPrice: Number(r.suggested_price || 0), createdAt: r.created_at
});
const mapPrecProduto = r => ({
  id: r.id, precificacaoId: r.precificacao_id,
  productName: r.product_name, quantity: Number(r.quantity || 0),
  unitCost: Number(r.unit_cost || 0), total: Number(r.total || 0)
});
const mapPrecSupply = r => ({
  id: r.id, precificacaoId: r.precificacao_id,
  name: r.name, quantity: Number(r.quantity || 0),
  unitCost: Number(r.unit_cost || 0), total: Number(r.total || 0)
});

/* DB rows (JS → snake_case para Supabase) */
const dbEntry = (e) => ({
  id: e.id, date: e.date,
  client_name:  e.clientName  || null,
  procedure:    e.procedure   || null,
  value:        e.value,
  payment:      e.payment     || null,
  photo_before: e.photoBefore || null,
  photo_after:  e.photoAfter  || null,
  user_id:      currentUser.id
});
const dbExit = (e) => ({
  id: e.id, date: e.date, category: e.category,
  description: e.description, value: e.value, user_id: currentUser.id
});
const dbProduct = (p) => ({
  id: p.id, name: p.name, category: p.category, supplier: p.supplier || null,
  qty: p.qty, unit_cost: p.unitCost, total_cost: p.totalCost,
  procedure: p.procedure || null, procedure_price: p.procedurePrice || 0,
  notes: p.notes || null, user_id: currentUser.id
});
const dbClinic = (c) => ({
  id: c.id, date: c.date, category: c.category,
  description: c.description, value: c.value,
  recurrence: c.recurrence, user_id: currentUser.id
});
const dbNota = (n) => ({
  id: n.id, date: n.date, number: n.number, supplier: n.supplier,
  description: n.description, value: n.value,
  notes: n.notes || null, file_data: n.fileData || null,
  user_id: currentUser.id
});
const dbPricing = (p) => ({
  id: p.id, procedure: p.procedure,
  target_price:   p.targetPrice   || 0,
  min_price:      p.minPrice      || 0,
  estimated_time: p.estimatedTime || 60,
  notes: p.notes || null, user_id: currentUser.id
});
const dbPricingInsumo = (pi) => ({
  id: pi.id, precificacao_id: pi.precificacaoId,
  produto_id: pi.produtoId, qty_used: pi.qtyUsed,
  user_id: currentUser.id
});
const dbEntradaInsumo = (ei) => ({
  id: ei.id, entrada_id: ei.entradaId,
  produto_id: ei.produtoId, qty_used: ei.qtyUsed,
  unit_cost: ei.unitCost, user_id: currentUser.id
});

/* DB converters — nova precificação calculadora */
const dbPrecFull = p => ({
  id: p.id, user_id: currentUser.id, procedure: p.procedure,
  duration_min: p.durationMin, hourly_rate: p.hourlyRate,
  labor_cost: p.laborCost, products_cost: p.productsCost,
  supplies_cost: p.suppliesCost, fixed_cost: p.fixedCost,
  total_cost: p.totalCost, margin_pct: p.marginPct,
  suggested_price: p.suggestedPrice
});
const dbPrecProduto = p => ({
  id: p.id, precificacao_id: p.precificacaoId, user_id: currentUser.id,
  product_name: p.productName, quantity: p.quantity,
  unit_cost: p.unitCost, total: p.total
});
const dbPrecSupply = s => ({
  id: s.id, precificacao_id: s.precificacaoId, user_id: currentUser.id,
  name: s.name, quantity: s.quantity,
  unit_cost: s.unitCost, total: s.total
});

/* ===== DATA CACHE ===== */
const state = {
  currentView: 'dashboard',
  filter: { period: 'month', start: null, end: null },
  searchTerms: { entradas: '', saidas: '', produtos: '', consultorio: '', notas: '', precificacao: '' },
  produtosSubTab: 'produtos',
  pendingPhotos: {},
  editingId: null,
  chartInstances: {},
  editingPrecId: null,
  data: { entries: [], exits: [], products: [], clinic: [], notas: [], pricing: [], pricingInsumos: [], entradaInsumos: [], precificacoes: [], precProdutos: [], precSupplies: [] }
};

/* ===== LOAD ALL DATA ===== */
async function loadAllData(signal) {
  showLoading('Carregando dados…');
  try {
    const uid = currentUser.id;
    // 3 lotes de 3 requests para nunca saturar o pool de 6 conexões HTTP por host
    const [en, ex, pr] = await Promise.all([
      db('entradas', signal).select('id,date,client_name,procedure,value,payment,user_id').eq('user_id', uid).order('date', { ascending: false }),
      db('saidas', signal).select('*').eq('user_id', uid).order('date', { ascending: false }),
      db('produtos', signal).select('*').eq('user_id', uid).order('name'),
    ]);
    if (signal?.aborted) return;

    const [cl, nf, pf] = await Promise.all([
      db('consultorio', signal).select('*').eq('user_id', uid).order('date', { ascending: false }),
      db('notas_fiscais', signal).select('id,date,supplier,number,value,description,user_id').eq('user_id', uid).order('date', { ascending: false }),
      db('profiles', signal).select('id,email,cpf,first_name,last_name,specialty,avatar_data').eq('id', uid).single(),
    ]);
    if (signal?.aborted) return;

    const [pc, pi, ei] = await Promise.all([
      db('precificacao', signal).select('*').eq('user_id', uid),
      db('precificacao_insumos', signal).select('id,precificacao_id,produto_id,qty_used,user_id').eq('user_id', uid),
      db('entrada_insumos', signal).select('id,entrada_id,produto_id,qty_used,unit_cost,user_id').eq('user_id', uid)
    ]);
    if (signal?.aborted) return;

    state.data = {
      entries:        (en.data || []).map(mapEntry),
      exits:          (ex.data || []).map(mapExit),
      products:       (pr.data || []).map(mapProduct),
      clinic:         (cl.data || []).map(mapClinic),
      notas:          (nf.data || []).map(mapNota),
      pricing:        (pc.data || []).map(mapPricing),
      pricingInsumos: (pi.data || []).map(mapPricingInsumo),
      entradaInsumos: (ei.data || []).map(mapEntradaInsumo)
    };
    currentProfile = pf.data || {};
    updateSidebarProfile();
  } catch(e) {
    if (e.name === 'AbortError') return; // carga cancelada por novo evento de auth
    toast('Erro ao carregar dados. Verifique sua conexão.', 'error');
    console.error(e);
  } finally {
    hideLoading();
  }
}

/* ===== getData() — lê do cache ===== */
const getData = () => ({
  entries:        state.data.entries,
  exits:          state.data.exits,
  products:       state.data.products,
  clinic:         state.data.clinic,
  notas:          state.data.notas,
  pricing:        state.data.pricing,
  pricingInsumos: state.data.pricingInsumos,
  entradaInsumos: state.data.entradaInsumos
});

/* ===== Adapters para fotos (agora ficam dentro do entry) ===== */
const loadPhotos = () => {
  const photos = {};
  state.data.entries.forEach(e => {
    if (e.photoBefore || e.photoAfter)
      photos[e.id] = { before: e.photoBefore, after: e.photoAfter };
  });
  return photos;
};

/* ===== CONSTANTS ===== */
const PROCEDURES = {
  botox: 'Botox',
  preenchimento_labial: 'Preenchimento Labial',
  olheiras: 'Preenchimento de Olheiras',
  fios_pdo: 'Fios de PDO',
  rinomodelacao: 'Rinomodelação',
  harmonizacao: 'Harmonização Facial',
  limpeza_pele: 'Limpeza de Pele',
  peeling_quimico: 'Peeling Químico',
  outros: 'Outros'
};
const PAYMENT_METHODS = {
  pix: 'PIX', dinheiro: 'Dinheiro',
  debito: 'Cartão de Débito', credito: 'Cartão de Crédito'
};
const EXIT_CATEGORIES = {
  produtos_insumos: 'Produtos & Insumos', aluguel: 'Aluguel',
  cursos: 'Cursos & Capacitações', equipamentos: 'Equipamentos', outros: 'Outros'
};
const CLINIC_CATEGORIES = {
  aluguel:'Aluguel', energia:'Energia Elétrica', agua:'Água',
  internet:'Internet', telefone:'Telefone', limpeza:'Limpeza & Higiene',
  seguranca:'Segurança / Alarme', condominio:'Condomínio',
  manutencao:'Manutenção', outros:'Outros'
};
const PRODUCT_CATEGORIES = {
  toxina:'Toxina Botulínica', acido_hialuronico:'Ácido Hialurônico',
  fios:'Fios de PDO', anestesico:'Anestésico',
  descartaveis:'Descartáveis', equipamento:'Equipamento', outros:'Outros'
};

/* ===== UTILS ===== */
const fCurrency = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fDate = s => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('pt-BR'); };
const fDateShort = s => { const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); };
const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const today = () => new Date().toISOString().split('T')[0];
const uid = () => crypto.randomUUID();

function getDateRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const { period, start, end } = state.filter;
  let s, e = new Date(y, m, d, 23, 59, 59);
  if (period === 'today') s = new Date(y, m, d);
  else if (period === 'week') { const dow = now.getDay(); s = new Date(y, m, d - dow); }
  else if (period === 'month') s = new Date(y, m, 1);
  else if (period === 'year') s = new Date(y, 0, 1);
  else if (period === 'custom') {
    s = start ? new Date(start + 'T00:00:00') : new Date(y, m, 1);
    e = end ? new Date(end + 'T23:59:59') : e;
  } else s = new Date(y, m, 1);
  return { s, e };
}

function filterByPeriod(arr) {
  const { s, e } = getDateRange();
  return arr.filter(x => { const d = new Date(x.date + 'T12:00:00'); return d >= s && d <= e; });
}

/* Filtro específico do Consultório: gastos FIXOS (mensais) valem para
   todos os períodos/meses; gastos pontuais são filtrados pela data. */
function filterClinicByPeriod(arr) {
  const { s, e } = getDateRange();
  return arr.filter(x => {
    if (x.recurrence === 'mensal') return true;
    const d = new Date(x.date + 'T12:00:00');
    return d >= s && d <= e;
  });
}

/* ===== NOTIFICAÇÕES — pagamentos do consultório próximos do vencimento ===== */
const NOTIF_WINDOW_DAYS = 7; // avisa pagamentos que vencem dentro deste prazo
const toISODate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/* Próxima ocorrência de um dia do mês a partir de "from" (inclui hoje). */
function nextMonthlyDue(day, from) {
  const y = from.getFullYear(), m = from.getMonth();
  let d = new Date(y, m, Math.min(day, daysInMonth(y, m)));
  if (d < from) { const nm = m + 1; d = new Date(y, nm, Math.min(day, daysInMonth(y, nm))); }
  d.setHours(0, 0, 0, 0);
  return d;
}

/* Lista os gastos do consultório cujo vencimento cai dentro da janela. */
function getUpcomingClinicPayments(windowDays = NOTIF_WINDOW_DAYS) {
  const clinic = getData().clinic || [];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const out = [];
  clinic.forEach(e => {
    if (!e.date) return;
    let due;
    if (e.recurrence === 'mensal') {
      // gasto fixo: usa o DIA da data cadastrada como dia de vencimento mensal
      const day = new Date(e.date + 'T12:00:00').getDate();
      due = nextMonthlyDue(day, now);
    } else {
      // gasto pontual: usa a própria data (só avisa se for hoje ou futura)
      due = new Date(e.date + 'T12:00:00'); due.setHours(0, 0, 0, 0);
    }
    const diffDays = Math.round((due - now) / 86400000);
    if (diffDays >= 0 && diffDays <= windowDays) out.push({ ...e, due, diffDays });
  });
  return out.sort((a, b) => a.due - b.due);
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const n = getUpcomingClinicPayments().length;
  if (n > 0) { badge.textContent = n > 9 ? '9+' : n; badge.style.display = ''; }
  else badge.style.display = 'none';
}

function renderNotifDropdown() {
  const body = document.getElementById('notifDropdownBody');
  if (!body) return;
  const list = getUpcomingClinicPayments();
  if (!list.length) {
    body.innerHTML = `<div class="notif-empty">Nenhum pagamento próximo do vencimento.</div>`;
    return;
  }
  body.innerHTML = list.map(e => {
    const when = e.diffDays === 0 ? 'Vence hoje'
               : e.diffDays === 1 ? 'Vence amanhã'
               : `Vence em ${e.diffDays} dias`;
    const urgency = e.diffDays <= 1 ? 'notif-urgent' : e.diffDays <= 3 ? 'notif-soon' : '';
    return `<div class="notif-item ${urgency}" onclick="navigateTo('consultorio');closeNotifPanel()">
      <div class="notif-item-main">
        <div class="notif-item-title">${esc(e.description)}</div>
        <div class="notif-item-sub">${CLINIC_CATEGORIES[e.category] || e.category} · ${fCurrency(e.value)}${e.recurrence === 'mensal' ? ' · fixo' : ''}</div>
      </div>
      <div class="notif-item-when">
        <span class="notif-when-label">${when}</span>
        <span class="notif-when-date">${fDateShort(toISODate(e.due))}</span>
      </div>
    </div>`;
  }).join('');
}

let _notifOutsideHandler = null;
function toggleNotifPanel(ev) {
  if (ev) ev.stopPropagation();
  const dd = document.getElementById('notifDropdown');
  if (!dd) return;
  const open = dd.classList.toggle('open');
  if (open) {
    renderNotifDropdown();
    _notifOutsideHandler = (e) => {
      const wrap = document.querySelector('.notif-wrap');
      if (wrap && !wrap.contains(e.target)) closeNotifPanel();
    };
    document.addEventListener('click', _notifOutsideHandler);
  } else if (_notifOutsideHandler) {
    document.removeEventListener('click', _notifOutsideHandler);
    _notifOutsideHandler = null;
  }
}
function closeNotifPanel() {
  const dd = document.getElementById('notifDropdown');
  if (dd) dd.classList.remove('open');
  if (_notifOutsideHandler) { document.removeEventListener('click', _notifOutsideHandler); _notifOutsideHandler = null; }
}

/* ===== NAVIGATION ===== */
function navigateTo(view) {
  destroyAllCharts();
  state.currentView = view;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  const titles = {
    dashboard:'Dashboard', entradas:'Entradas', saidas:'Saídas',
    consultorio:'Consultório', produtos:'Produtos & Insumos',
    margem:'Margem de Lucro', precificacao:'Precificação', graficos:'Gráficos & Relatórios', perfil:'Perfil',
    anamnese:'Ficha de Anamnese', receituario:'Receituário', exames:'Receituário de Exames',
    contratos:'Contratos & Termos'
  };
  document.getElementById('pageTitle').textContent = titles[view] || view;
  renderView(view);
  if (window.innerWidth < 768) closeSidebar();
}

function renderView(view) {
  const content = document.getElementById('content');
  const renders = {
    dashboard: renderDashboard, entradas: renderEntradas, saidas: renderSaidas,
    consultorio: renderConsultorio, produtos: renderProdutos,
    margem: renderMargem, precificacao: renderPrecificacao, graficos: renderGraficos, perfil: renderPerfil,
    anamnese: (typeof renderAnamnese === 'function' ? renderAnamnese : () => ''),
    receituario: (typeof renderReceituario === 'function' ? renderReceituario : () => ''),
    exames: (typeof renderExames === 'function' ? renderExames : () => ''),
    contratos: (typeof renderContratos === 'function' ? renderContratos : () => '')
  };
  content.innerHTML = (renders[view] || (() => ''))();
  if (view === 'dashboard') setTimeout(initDashboardCharts, 50);
  if (view === 'graficos')  setTimeout(initGraficosCharts, 50);
  setTimeout(initDatePickers, 10);
}

/* ===== CHART MANAGEMENT ===== */
function destroyAllCharts() {
  Object.values(state.chartInstances).forEach(c => { try { c.destroy(); } catch(e){} });
  state.chartInstances = {};
}
function createChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (state.chartInstances[id]) { state.chartInstances[id].destroy(); }
  state.chartInstances[id] = new Chart(ctx, config);
}

/* ===== PERIOD FILTER ===== */
function setPeriod(p) { state.filter.period = p; renderView(state.currentView); }
function setCustomDate(which, val) { state.filter[which] = val; renderView(state.currentView); }

function periodFilterHTML(extraClass = '') {
  const { period } = state.filter;
  const btns = [['today','Hoje'],['week','Semana'],['month','Mês'],['year','Ano'],['custom','Período']];
  const customHTML = period === 'custom' ? `
    <div class="filter-custom">
      <input type="date" class="filter-input" id="filterStart" value="${state.filter.start || ''}" onchange="setCustomDate('start', this.value)" />
      <span style="color:var(--text-3);font-size:12px">até</span>
      <input type="date" class="filter-input" id="filterEnd" value="${state.filter.end || ''}" onchange="setCustomDate('end', this.value)" />
    </div>` : '';
  return `<div class="filter-bar ${extraClass}">
    <span class="filter-label">Período:</span>
    ${btns.map(([k,l]) => `<button class="filter-btn${period===k?' active':''}" onclick="setPeriod('${k}')">${l}</button>`).join('')}
    ${customHTML}
  </div>`;
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const { entries, exits, clinic, products } = getData();
  const fe = filterByPeriod(entries);
  const fx = filterByPeriod(exits);
  const fc = filterClinicByPeriod(clinic);
  const revenue      = fe.reduce((s,e) => s + e.value, 0);
  const expSaidas    = fx.reduce((s,e) => s + e.value, 0);
  const expClinic    = fc.reduce((s,e) => s + e.value, 0);
  const expProducts  = products.reduce((s,p) => s + p.totalCost, 0);
  const expenses     = expSaidas + expClinic + expProducts;
  const profit       = revenue - expenses;
  const count        = fe.length;
  const margin       = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;

  const recentSorted = fe.slice().sort((a,b) => b.date.localeCompare(a.date));

  return `
  <div class="export-card">
    <div class="export-card-text">
      <div class="export-card-title">Exportar Relatório Financeiro em PDF</div>
      <div class="export-card-sub">Entradas, saídas e lucro compilados em um relatório profissional</div>
    </div>
    <div class="export-btns">
      <button class="btn-export btn-export-week" onclick="generatePDF('Semanal')">${iconDownload()} Relatório Semanal</button>
      <button class="btn-export btn-export-month" onclick="generatePDF('Mensal')">${iconDownload()} Relatório Mensal</button>
    </div>
  </div>
  ${periodFilterHTML()}
  <div class="dash-layout">
    <div class="dash-main">
      <div class="stats-grid">
        ${statCard('Receita Total',   fCurrency(revenue),  'green', 'Entradas no período',  iconTrend(),  `<span class="stat-badge up">↑ ${count} procedimentos</span>`)}
        ${statCard('Despesas Totais', fCurrency(expenses), 'red',   `Saídas: ${fCurrency(expSaidas)} · Consul.: ${fCurrency(expClinic)} · Prod.: ${fCurrency(expProducts)}`, iconDown(), '')}
        ${statCard('Lucro Líquido',   fCurrency(profit),   profit >= 0 ? 'gold' : 'red', `Margem: ${margin}%`, iconDollar(), `<span class="stat-badge ${profit>=0?'up':'down'}">${profit>=0?'↑':'↓'} ${margin}%</span>`)}
        ${statCard('Procedimentos',   count, 'blue', 'Realizados no período', iconClip(), '')}
      </div>
      <div class="charts-grid">
        <div class="card">
          <div class="card-header"><span class="card-title">Receita × Despesa × Lucro</span><span class="card-sub">Últimos 6 meses</span></div>
          <div class="chart-wrap"><canvas id="chartRevExp" height="240"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Formas de Pagamento</span><span class="card-sub">No período selecionado</span></div>
          <div class="chart-wrap"><canvas id="chartPayment" height="240"></canvas></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Procedimentos Recentes</span><span class="card-sub">Últimas entradas</span></div>
        <div class="card-body" style="padding-top:8px">
          ${recentEntriesTable(recentSorted.slice(0,8))}
        </div>
      </div>
    </div>
    <div class="dash-right">
      ${recentPanel(recentSorted.slice(0,10))}
    </div>
  </div>`;
}

function statCard(label, value, color, sub, icon, badge) {
  return `<div class="stat-card ${color}">
    <div class="stat-header"><span class="stat-label">${label}</span><span class="stat-icon ${color}">${icon}</span></div>
    <div class="stat-value">${value}</div>
    <div class="stat-sub">${sub}</div>
    ${badge ? `<div style="margin-top:8px">${badge}</div>` : ''}
  </div>`;
}

function recentEntriesTable(items) {
  if (!items.length) return `<div class="empty-state">${iconEmptyBox()}<h3>Nenhuma entrada no período</h3><p>Adicione procedimentos para visualizar.</p></div>`;
  return `<table><thead><tr><th>Data</th><th>Cliente</th><th>Procedimento</th><th>Pagamento</th><th style="text-align:right">Valor</th></tr></thead><tbody>
  ${items.map(e => `<tr>
    <td class="no-wrap fs-13 color-2">${fDate(e.date)}</td>
    <td class="fw-600">${esc(e.clientName || '—')}</td>
    <td>${badgeProcedure(e.procedure)}</td>
    <td>${badgePayment(e.payment)}</td>
    <td style="text-align:right" class="val-green fw-600">${fCurrency(e.value)}</td>
  </tr>`).join('')}
  </tbody></table>`;
}

/* Gera cor de avatar a partir do nome (hash determinístico) */
function avatarColor(name) {
  const colors = ['#5E8C61','#6E8595','#94808C','#C9A06A','#B85C44','#6E8595','#B3907A','#8A7B4E'];
  let h = 0;
  for (let i = 0; i < (name||'?').length; i++) h = (h * 31 + (name||'?').charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

/* Tempo relativo em português */
function relativeTime(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T12:00:00'); d.setHours(0,0,0,0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7)  return `${diff} dias atrás`;
  return fDate(dateStr);
}

/* Painel direito de atendimentos recentes */
function recentPanel(items) {
  const list = items.length
    ? items.map(e => {
        const name   = esc(e.clientName || 'Paciente');
        const initials = name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || '?';
        const color  = avatarColor(e.clientName || '');
        const proc   = PROCEDURES[e.procedure] || e.procedure || '—';
        return `<div class="recent-item">
          <div class="recent-avatar" style="background:${color}">${initials}</div>
          <div class="recent-info">
            <div class="recent-name">${name}</div>
            <div class="recent-time">${relativeTime(e.date)}</div>
          </div>
          <div class="recent-right">
            <span class="recent-value">${fCurrency(e.value)}</span>
            <span class="recent-badge">${esc(proc.length > 16 ? proc.slice(0,16)+'…' : proc)}</span>
          </div>
        </div>`;
      }).join('')
    : `<div style="padding:32px 16px;text-align:center;color:var(--text-3);font-size:13px">Nenhum atendimento no período</div>`;

  return `<div class="recent-panel">
    <div class="recent-panel-header">
      <span class="recent-panel-title">Atendimentos Recentes</span>
      <button class="recent-panel-link" onclick="navigateTo('entradas')">Ver todos</button>
    </div>
    <div class="recent-list">${list}</div>
  </div>`;
}

function initDashboardCharts() {
  const { entries, exits, clinic, products } = getData();
  Chart.defaults.font.family = 'DM Sans, sans-serif';
  Chart.defaults.color = '#64748B';
  const monthly = getMonthlyData(entries, exits, clinic, 6, products);
  createChart('chartRevExp', {
    type: 'bar',
    data: {
      labels: monthly.map(m => m.label),
      datasets: [
        { label: 'Receita',  data: monthly.map(m => m.revenue),  backgroundColor: 'rgba(94,140,97,0.8)', borderRadius: 6 },
        { label: 'Despesas', data: monthly.map(m => m.expenses), backgroundColor: 'rgba(184,92,68,0.7)',  borderRadius: 6 },
        { label: 'Lucro',    data: monthly.map(m => m.profit),   backgroundColor: 'rgba(201,160,106,0.8)', borderRadius: 6, type: 'line', borderColor: '#C9A06A', fill: false, tension: 0.3, borderWidth: 2.5, pointRadius: 4 }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fCurrency(ctx.raw)}` } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => fCurrency(v) } } } }
  });
  const { s, e } = getDateRange();
  const fe = filterByPeriod(entries);
  const payLabels = Object.values(PAYMENT_METHODS);
  const payData   = Object.keys(PAYMENT_METHODS).map(k => fe.filter(x => x.payment === k).reduce((s,x) => s+x.value, 0));
  createChart('chartPayment', {
    type: 'doughnut',
    data: { labels: payLabels, datasets: [{ data: payData, backgroundColor: ['#5E8C61','#6E8595','#C9A06A','#94808C'], borderWidth: 2, borderColor: 'var(--card)', hoverOffset: 6 }] },
    options: { responsive: true, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14, font: { size: 12 } } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fCurrency(ctx.raw)}` } } } }
  });
}

function getMonthlyData(entries, exits, clinic, n, products) {
  const result = [];
  // Custo total de produtos (não tem data, distribui igualmente entre os meses)
  const totalProductsCost = (products || []).reduce((s,p) => s + p.totalCost, 0);
  const productsCostPerMonth = totalProductsCost / (n || 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const y = d.getFullYear(), m = d.getMonth();
    const label      = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    const inMonth    = arr => arr.filter(e => { const ed = new Date(e.date+'T12:00:00'); return ed.getFullYear()===y && ed.getMonth()===m; });
    const revenue    = inMonth(entries).reduce((s,e) => s+e.value, 0);
    const expSaidas  = inMonth(exits).reduce((s,e) => s+e.value, 0);
    const expClinic  = inMonth(clinic).reduce((s,e) => s+e.value, 0);
    const expenses   = expSaidas + expClinic + productsCostPerMonth;
    result.push({ label, revenue, expenses, expSaidas, expClinic, expProducts: productsCostPerMonth, profit: revenue - expenses });
  }
  return result;
}

/* ===== ENTRADAS ===== */
function renderEntradas() {
  const { entries } = getData();
  const fe = filterByPeriod(entries);
  const q  = state.searchTerms.entradas.toLowerCase();
  const filtered = q ? fe.filter(e => (e.clientName||'').toLowerCase().includes(q) || PROCEDURES[e.procedure]?.toLowerCase().includes(q)) : fe;
  const sorted = filtered.slice().sort((a,b) => b.date.localeCompare(a.date));
  const total  = sorted.reduce((s,e) => s+e.value, 0);
  const allPhotos = loadPhotos();

  return `
  <div class="section-header">
    <div><div class="section-title">Entradas</div><div class="section-sub">Registre todas as receitas dos procedimentos</div></div>
    <button class="btn btn-primary" onclick="openEntradaModal()">${iconPlus()} Nova Entrada</button>
  </div>
  ${periodFilterHTML()}
  <div class="table-container">
    <div class="table-toolbar">
      <div class="table-search">${iconSearch()}
        <input type="text" placeholder="Buscar por cliente ou procedimento…" value="${esc(state.searchTerms.entradas)}" oninput="setSearch('entradas', this.value)" />
      </div>
      <span style="font-size:13px;color:var(--text-2)">${sorted.length} registro${sorted.length!==1?'s':''}</span>
    </div>
    ${sorted.length ? `
    <table><thead><tr>
      <th>Data</th><th>Cliente</th><th>Procedimento</th><th>Pagamento</th><th style="text-align:center">Fotos</th><th style="text-align:right">Valor</th><th style="text-align:right">Ações</th>
    </tr></thead><tbody>
    ${sorted.map(e => {
      const hasPhoto = allPhotos[e.id]?.before || allPhotos[e.id]?.after;
      return `<tr>
      <td class="no-wrap fs-13 color-2">${fDate(e.date)}</td>
      <td class="fw-600">${esc(e.clientName || '—')}</td>
      <td>${badgeProcedure(e.procedure)}</td>
      <td>${badgePayment(e.payment)}</td>
      <td style="text-align:center">
        ${hasPhoto
          ? `<button class="btn btn-ghost btn-icon" title="Ver fotos antes/depois" onclick="viewPatientPhotos('${e.id}','${esc(e.clientName||'Paciente')}')" style="color:var(--accent)">${iconCamera()}</button>`
          : `<span style="color:var(--text-3);font-size:12px">—</span>`}
      </td>
      <td style="text-align:right" class="val-green fw-600">${fCurrency(e.value)}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-icon" title="Editar"  onclick="openEntradaModal('${e.id}')">${iconEdit()}</button>
        <button class="btn btn-danger btn-icon" title="Excluir" onclick="deleteEntry('${e.id}')">${iconTrash()}</button>
      </div></td>
    </tr>`;}).join('')}
    </tbody></table>
    <div class="summary-row">
      <div class="summary-item"><span class="summary-label">Total no período:</span><span class="summary-value val-green">${fCurrency(total)}</span></div>
      <div class="summary-item"><span class="summary-label">Média por procedimento:</span><span class="summary-value">${sorted.length ? fCurrency(total/sorted.length) : fCurrency(0)}</span></div>
    </div>
    ` : `<div class="empty-state">${iconEmptyBox()}<h3>Nenhuma entrada encontrada</h3><p>Adicione sua primeira entrada ou ajuste os filtros.</p></div>`}
  </div>`;
}

function openEntradaModal(id = null) {
  const { entries } = getData();
  const e = id ? entries.find(x => x.id === id) : null;
  state.editingId = id;
  state.pendingPhotos = { before: e?.photoBefore || null, after: e?.photoAfter || null };

  const photoSlot = (type, label, existing) => `
    <div>
      <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:6px">${label}</div>
      <div class="photo-upload-slot" id="slot_${type}">
        <input type="file" accept="image/*" onchange="handlePatientPhoto('${type}', this)" />
        ${existing
          ? `<img src="${existing}" class="photo-preview-img" id="preview_${type}" /><span class="pu-label">Clique para trocar</span>`
          : `<span class="pu-icon">📷</span><span class="pu-label">Upload foto ${label.toLowerCase()}</span>`}
      </div>
    </div>`;

  openModal(id ? 'Editar Entrada' : 'Nova Entrada', `
    <form onsubmit="saveEntrada(event)">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input type="date" class="form-control" id="eDate" value="${e?.date || today()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Nome do Cliente</label>
          <input type="text" class="form-control" id="eClient" value="${esc(e?.clientName || '')}" placeholder="Opcional" />
        </div>
        <div class="form-group">
          <label class="form-label">Procedimento *</label>
          <select class="form-control" id="eProcedure" required>
            <option value="">Selecione…</option>
            ${Object.entries(PROCEDURES).map(([k,v]) => `<option value="${k}" ${e?.procedure===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Valor Recebido (R$) *</label>
          <input type="number" class="form-control" id="eValue" value="${e?.value || ''}" step="0.01" min="0" placeholder="0,00" required />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Forma de Pagamento *</label>
          <select class="form-control" id="ePayment" required>
            <option value="">Selecione…</option>
            ${Object.entries(PAYMENT_METHODS).map(([k,v]) => `<option value="${k}" ${e?.payment===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group form-full">
          <label class="form-label">Fotos do Paciente — Antes &amp; Depois</label>
          <div class="photo-upload-grid">
            ${photoSlot('before', 'Antes', state.pendingPhotos.before)}
            ${photoSlot('after',  'Depois', state.pendingPhotos.after)}
          </div>
        </div>
        <div class="form-group form-full">
          <label class="form-label">Insumos Utilizados neste Atendimento</label>
          <div id="eiRowsContainer">${buildEntradaInsumosRows(id)}</div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px" onclick="addEiRow()">
            ${iconPlus()} Adicionar Insumo
          </button>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="saveEntradaBtn">${iconCheck()} ${id ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`, true);
}

function handlePatientPhoto(type, input) {
  const file = input.files[0];
  if (!file) return;
  resizeImage(file, 800, data => {
    state.pendingPhotos[type] = data;
    const slot = document.getElementById(`slot_${type}`);
    if (slot) slot.innerHTML = `<input type="file" accept="image/*" onchange="handlePatientPhoto('${type}', this)" /><img src="${data}" class="photo-preview-img" /><span class="pu-label">Clique para trocar</span>`;
  });
}

function resizeImage(file, maxPx, callback) {
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const ratio  = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveEntrada(event) {
  event.preventDefault();
  const btn = document.getElementById('saveEntradaBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  const entryId = state.editingId || uid();
  const entry = {
    id: entryId,
    date:       document.getElementById('eDate').value,
    clientName: document.getElementById('eClient').value.trim(),
    procedure:  document.getElementById('eProcedure').value,
    value:      parseFloat(document.getElementById('eValue').value),
    payment:    document.getElementById('ePayment').value,
    photoBefore: state.pendingPhotos.before || null,
    photoAfter:  state.pendingPhotos.after  || null
  };

  const row = dbEntry(entry);
  const { error } = state.editingId
    ? await db('entradas').update(row).eq('id', state.editingId)
    : await db('entradas').insert(row);
  if (error) { console.error('Erro entrada:', error); toast('Erro: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; } return; }

  if (state.editingId) {
    const idx = state.data.entries.findIndex(x => x.id === state.editingId);
    if (idx !== -1) state.data.entries[idx] = entry;
    toast('Entrada atualizada!', 'success');
  } else {
    state.data.entries.unshift(entry);
    toast('Entrada adicionada!', 'success');
  }

  state.pendingPhotos = {};
  closeModal();          // fecha imediatamente sem esperar insumos
  renderView('entradas');
  saveEntradaInsumos(entryId); // salva insumos em background (não bloqueia)
}

function buildEntradaInsumosRows(entradaId) {
  const { entradaInsumos, products } = getData();
  const existing = entradaId ? entradaInsumos.filter(ei => ei.entradaId === entradaId) : [];
  if (!existing.length) return '';
  return existing.map((ei, idx) => `
    <div class="pi-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <select class="form-control" name="ei_produto_${idx}" style="flex:1">
        <option value="">Selecione produto…</option>
        ${products.map(p => `<option value="${p.id}" ${p.id===ei.produtoId?'selected':''}>${esc(p.name)} (custo: ${fCurrency(p.unitCost)}/un)</option>`).join('')}
      </select>
      <input type="number" class="form-control" name="ei_qty_${idx}" value="${ei.qtyUsed}" min="0.01" step="0.01" style="width:80px" placeholder="Qtd" />
      <button type="button" class="btn btn-danger btn-icon btn-sm" onclick="removePiRow(this)">${iconTrash()}</button>
    </div>`).join('');
}

function addEiRow() {
  const { products } = getData();
  const container = document.getElementById('eiRowsContainer');
  if (!container) return;
  const idx = container.querySelectorAll('.pi-row').length;
  const div = document.createElement('div');
  div.className = 'pi-row';
  div.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
  div.innerHTML = `
    <select class="form-control" name="ei_produto_${idx}" style="flex:1">
      <option value="">Selecione produto…</option>
      ${products.map(p => `<option value="${p.id}">${esc(p.name)} (custo: ${fCurrency(p.unitCost)}/un)</option>`).join('')}
    </select>
    <input type="number" class="form-control" name="ei_qty_${idx}" value="1" min="0.01" step="0.01" style="width:80px" placeholder="Qtd" />
    <button type="button" class="btn btn-danger btn-icon btn-sm" onclick="removePiRow(this)">${iconTrash()}</button>`;
  container.appendChild(div);
}

async function saveEntradaInsumos(entradaId) {
  const { products } = getData();
  const container = document.getElementById('eiRowsContainer');
  if (!container) return; // sem insumos no form, não bloquear

  const rows = container.querySelectorAll('.pi-row');
  const newInsumos = [];
  rows.forEach(row => {
    const prodSel = row.querySelector('select');
    const qtyInp  = row.querySelector('input[type="number"]');
    if (prodSel?.value && qtyInp?.value) {
      const prod = products.find(p => p.id === prodSel.value);
      newInsumos.push({ id: uid(), entradaId, produtoId: prodSel.value,
        qtyUsed: parseFloat(qtyInp.value) || 1, unitCost: prod?.unitCost || 0 });
    }
  });

  // Só faz chamadas ao banco se há insumos para salvar OU se era uma edição
  const isEditing = !!state.editingId;
  if (!newInsumos.length && !isEditing) return; // nova entrada sem insumos: não bloquear

  try {
    if (isEditing) {
      await db('entrada_insumos').delete().eq('entrada_id', entradaId);
    }
    if (newInsumos.length) {
      const { error } = await db('entrada_insumos').insert(newInsumos.map(dbEntradaInsumo));
      if (error) { toast('Aviso: insumos não salvos — ' + error.message, 'error'); return; }
    }
    state.data.entradaInsumos = state.data.entradaInsumos.filter(ei => ei.entradaId !== entradaId);
    state.data.entradaInsumos.push(...newInsumos);
  } catch(e) {
    console.warn('saveEntradaInsumos erro (não crítico):', e);
  }
}

async function viewPatientPhotos(id, clientName) {
  // Busca fotos sob demanda (não carregadas na listagem para economizar dados)
  openModal(`Fotos — ${clientName || 'Paciente'}`,
    `<div style="display:flex;align-items:center;justify-content:center;height:180px">
      <div style="width:24px;height:24px;border:3px solid var(--primary);border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div>
    </div>`, true);
  const { data, error } = await db('entradas')
    .select('photo_before,photo_after').eq('id', id).single();
  if (error || !data) { closeModal(); toast('Erro ao carregar fotos.','error'); return; }
  const before = data.photo_before;
  const after  = data.photo_after;
  if (!before && !after) { closeModal(); toast('Nenhuma foto cadastrada.','error'); return; }
  document.getElementById('modalBody').innerHTML =
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;text-align:center">ANTES</div>
        ${before ? `<img src="${before}" style="width:100%;border-radius:10px;border:1px solid var(--border)" />` : `<div style="height:180px;background:var(--bg);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:13px">Sem foto</div>`}
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-2);margin-bottom:8px;text-align:center">DEPOIS</div>
        ${after ? `<img src="${after}" style="width:100%;border-radius:10px;border:1px solid var(--border)" />` : `<div style="height:180px;background:var(--bg);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:13px">Sem foto</div>`}
      </div>
    </div>`;
}

async function deleteEntry(id) {
  if (!confirm('Excluir esta entrada?')) return;
  await db('entrada_insumos').delete().eq('entrada_id', id);
  const { error } = await db('entradas').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  state.data.entries        = state.data.entries.filter(x => x.id !== id);
  state.data.entradaInsumos = state.data.entradaInsumos.filter(x => x.entradaId !== id);
  toast('Entrada excluída.', 'success');
  renderView('entradas');
}

/* ===== SAÍDAS ===== */
function renderSaidas() {
  const { exits, products, clinic } = getData();
  const fe = filterByPeriod(exits);
  const fc = filterClinicByPeriod(clinic);
  const q  = state.searchTerms.saidas.toLowerCase();

  // Produtos cadastrados como saída
  const prodAsExits = products.map(p => ({
    id: p.id, date: today(), category: 'produtos_insumos',
    description: `${p.name} (${p.qty}x ${fCurrency(p.unitCost)})`,
    value: p.totalCost, _origin: 'product'
  }));

  // Consultório como saída
  const clinicAsExits = fc.map(c => ({
    id: c.id, date: c.date, category: c.category,
    description: c.description, value: c.value, _origin: 'clinic'
  }));

  const allItems = [...fe.map(e => ({ ...e, _origin: 'manual' })), ...prodAsExits, ...clinicAsExits];
  const filtered = q ? allItems.filter(e => (e.description||'').toLowerCase().includes(q) || (EXIT_CATEGORIES[e.category]||CLINIC_CATEGORIES[e.category]||'').toLowerCase().includes(q)) : allItems;
  const sorted = filtered.slice().sort((a,b) => b.date.localeCompare(a.date));
  const total         = sorted.reduce((s,e) => s+e.value, 0);
  const totalManual   = fe.reduce((s,e) => s+e.value, 0);
  const totalProdutos = prodAsExits.reduce((s,e) => s+e.value, 0);
  const totalClinic   = fc.reduce((s,e) => s+e.value, 0);

  const originBadge = (origin) => {
    if (origin === 'product') return '<span style="font-size:11px;background:rgba(139,92,246,0.1);color:#7C3AED;padding:2px 8px;border-radius:6px;font-weight:600">Produto</span>';
    if (origin === 'clinic')  return '<span style="font-size:11px;background:rgba(94,140,97,0.1);color:#5E8C61;padding:2px 8px;border-radius:6px;font-weight:600">Consultório</span>';
    return '<span style="font-size:11px;background:rgba(100,116,139,0.1);color:#64748B;padding:2px 8px;border-radius:6px;font-weight:600">Manual</span>';
  };
  const rowBg = (origin) => {
    if (origin === 'product') return ' style="background:rgba(139,92,246,0.04)"';
    if (origin === 'clinic')  return ' style="background:rgba(94,140,97,0.04)"';
    return '';
  };

  return `
  <div class="section-header">
    <div><div class="section-title">Saídas</div><div class="section-sub">Todas as despesas: manuais, consultório e produtos</div></div>
    <button class="btn btn-primary" onclick="openSaidaModal()">${iconPlus()} Nova Saída</button>
  </div>
  ${periodFilterHTML()}
  <div class="table-container">
    <div class="table-toolbar">
      <div class="table-search">${iconSearch()}
        <input type="text" placeholder="Buscar despesa…" value="${esc(state.searchTerms.saidas)}" oninput="setSearch('saidas', this.value)" />
      </div>
      <span style="font-size:13px;color:var(--text-2)">${sorted.length} registro${sorted.length!==1?'s':''}</span>
    </div>
    ${sorted.length ? `
    <table><thead><tr>
      <th>Data</th><th>Categoria</th><th>Descrição</th><th style="text-align:center">Origem</th><th style="text-align:right">Valor</th><th style="text-align:right">Ações</th>
    </tr></thead><tbody>
    ${sorted.map(e => `<tr${rowBg(e._origin)}>
      <td class="no-wrap fs-13 color-2">${fDate(e.date)}</td>
      <td>${badgeCategory(e.category)}</td>
      <td class="fw-600">${esc(e.description)}</td>
      <td style="text-align:center">${originBadge(e._origin)}</td>
      <td style="text-align:right" class="val-red fw-600">${fCurrency(e.value)}</td>
      <td><div class="td-actions">${
        e._origin === 'product'
          ? `<button class="btn btn-ghost btn-icon" title="Ver produto" onclick="navigateTo('produtos')">${iconEdit()}</button>`
          : e._origin === 'clinic'
            ? `<button class="btn btn-ghost btn-icon" title="Ver consultório" onclick="navigateTo('consultorio')">${iconEdit()}</button>`
            : `<button class="btn btn-ghost btn-icon" title="Editar"  onclick="openSaidaModal('${e.id}')">${iconEdit()}</button>
               <button class="btn btn-danger btn-icon" title="Excluir" onclick="deleteExit('${e.id}')">${iconTrash()}</button>`
      }</div></td>
    </tr>`).join('')}
    </tbody></table>
    <div class="summary-row">
      <div class="summary-item"><span class="summary-label">Total geral:</span><span class="summary-value val-red">${fCurrency(total)}</span></div>
      ${totalManual > 0 ? `<div class="summary-item"><span class="summary-label">Saídas manuais:</span><span class="summary-value">${fCurrency(totalManual)}</span></div>` : ''}
      ${totalClinic > 0 ? `<div class="summary-item"><span class="summary-label">Consultório:</span><span class="summary-value">${fCurrency(totalClinic)}</span></div>` : ''}
      ${totalProdutos > 0 ? `<div class="summary-item"><span class="summary-label">Produtos & Insumos:</span><span class="summary-value">${fCurrency(totalProdutos)}</span></div>` : ''}
    </div>
    ` : `<div class="empty-state">${iconEmptyBox()}<h3>Nenhuma saída encontrada</h3><p>Adicione despesas, cadastre produtos ou registre gastos do consultório.</p></div>`}
  </div>`;
}

function openSaidaModal(id = null) {
  const { exits } = getData();
  const e = id ? exits.find(x => x.id === id) : null;
  state.editingId = id;
  openModal(id ? 'Editar Saída' : 'Nova Saída', `
    <form onsubmit="saveSaida(event)">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input type="date" class="form-control" id="xDate" value="${e?.date || today()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Categoria *</label>
          <select class="form-control" id="xCategory" required>
            <option value="">Selecione…</option>
            ${Object.entries(EXIT_CATEGORIES).map(([k,v]) => `<option value="${k}" ${e?.category===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group form-full">
          <label class="form-label">Descrição *</label>
          <input type="text" class="form-control" id="xDesc" value="${esc(e?.description || '')}" placeholder="Ex: Toxina Botulínica Allergan 100U x2" required />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Valor (R$) *</label>
          <input type="number" class="form-control" id="xValue" value="${e?.value || ''}" step="0.01" min="0" placeholder="0,00" required />
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="saveSaidaBtn">${iconCheck()} ${id ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`);
}

async function saveSaida(event) {
  event.preventDefault();
  const btn = document.getElementById('saveSaidaBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  const exit = {
    id: state.editingId || uid(),
    date:        document.getElementById('xDate').value,
    category:    document.getElementById('xCategory').value,
    description: document.getElementById('xDesc').value.trim(),
    value:       parseFloat(document.getElementById('xValue').value)
  };

  const rowExit = dbExit(exit);
  const { error } = state.editingId
    ? await db('saidas').update(rowExit).eq('id', state.editingId)
    : await db('saidas').insert(rowExit);
  if (error) { console.error('Erro saída:', error); toast('Erro: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; } return; }

  if (state.editingId) {
    const idx = state.data.exits.findIndex(x => x.id === state.editingId);
    if (idx !== -1) state.data.exits[idx] = exit;
    toast('Saída atualizada!', 'success');
  } else {
    state.data.exits.unshift(exit);
    toast('Saída adicionada!', 'success');
  }
  closeModal();
  renderView('saidas');
}

async function deleteExit(id) {
  if (!confirm('Excluir esta saída?')) return;
  const { error } = await db('saidas').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  state.data.exits = state.data.exits.filter(x => x.id !== id);
  toast('Saída excluída.', 'success');
  renderView('saidas');
}

/* ===== PRODUTOS ===== */
function renderProdutos() {
  const isNotas = state.produtosSubTab === 'notas';
  return `
  <div class="section-header">
    <div><div class="section-title">Produtos & Insumos</div><div class="section-sub">Estoque, custos, lucro por produto e notas fiscais</div></div>
    <button class="btn btn-primary" onclick="${isNotas ? 'openNotaModal()' : 'openProdutoModal()'}">
      ${iconPlus()} ${isNotas ? 'Nova Nota Fiscal' : 'Novo Produto'}
    </button>
  </div>
  <div class="subtabs">
    <button class="subtab-btn ${!isNotas ? 'active' : ''}" onclick="setProdTab('produtos')">Produtos & Insumos</button>
    <button class="subtab-btn ${ isNotas ? 'active' : ''}" onclick="setProdTab('notas')">Notas Fiscais</button>
  </div>
  ${isNotas ? renderNotasContent() : renderProdutosContent()}`;
}

function setProdTab(tab) { state.produtosSubTab = tab; renderView('produtos'); }

function renderProdutosContent() {
  const { products } = getData();
  const q = state.searchTerms.produtos.toLowerCase();
  const filtered = q ? products.filter(p => p.name.toLowerCase().includes(q) || (p.supplier||'').toLowerCase().includes(q)) : products;
  const sorted = filtered.slice().sort((a,b) => a.name.localeCompare(b.name));
  const totalInvested = sorted.reduce((s,p) => s + p.totalCost, 0);

  return `
  <div class="table-container">
    <div class="table-toolbar">
      <div class="table-search">${iconSearch()}
        <input type="text" placeholder="Buscar produto ou fornecedor…" value="${esc(state.searchTerms.produtos)}" oninput="setSearch('produtos', this.value)" />
      </div>
      <span style="font-size:13px;color:var(--text-2)">${sorted.length} produto${sorted.length!==1?'s':''}</span>
    </div>
    ${sorted.length ? `
    <table><thead><tr>
      <th>Produto</th><th>Categoria</th><th>Qtd</th>
      <th style="text-align:right">Custo Unit.</th><th style="text-align:right">Custo Total</th>
      <th style="text-align:right">Vlr. Cobrado</th><th style="text-align:right">Lucro Unit.</th>
      <th style="text-align:right">Margem</th><th>Procedimento</th><th style="text-align:right">Ações</th>
    </tr></thead><tbody>
    ${sorted.map(p => {
      const pp = p.procedurePrice || 0;
      const lucro  = pp > 0 ? pp - p.unitCost : null;
      const margem = pp > 0 ? ((lucro / pp) * 100) : null;
      const margemColor = margem === null ? 'var(--text-3)' : margem >= 60 ? '#5E8C61' : margem >= 30 ? '#B07D3F' : '#B85C44';
      return `<tr>
        <td><div class="fw-600 fs-13">${esc(p.name)}</div>${p.notes ? `<div style="font-size:11px;color:var(--text-3);margin-top:1px">${esc(p.notes)}</div>` : ''}</td>
        <td>${badgeProductCategory(p.category)}</td>
        <td class="fw-600">${p.qty}</td>
        <td style="text-align:right" class="val-red">${fCurrency(p.unitCost)}</td>
        <td style="text-align:right" class="val-red fw-600">${fCurrency(p.totalCost)}</td>
        <td style="text-align:right" class="val-green">${pp > 0 ? fCurrency(pp) : '<span class="text-muted">—</span>'}</td>
        <td style="text-align:right"><span style="font-weight:700;color:${margemColor}">${lucro !== null ? fCurrency(lucro) : '<span class="text-muted">—</span>'}</span></td>
        <td style="text-align:right"><span style="font-weight:700;font-size:13px;color:${margemColor}">${margem !== null ? margem.toFixed(1) + '%' : '—'}</span></td>
        <td>${badgeProcedure(p.procedure)}</td>
        <td><div class="td-actions">
          <button class="btn btn-ghost btn-icon" title="Editar"  onclick="openProdutoModal('${p.id}')">${iconEdit()}</button>
          <button class="btn btn-danger btn-icon" title="Excluir" onclick="deleteProduct('${p.id}')">${iconTrash()}</button>
        </div></td>
      </tr>`;
    }).join('')}
    </tbody></table>
    <div class="summary-row">
      <div class="summary-item"><span class="summary-label">Total investido:</span><span class="summary-value val-red">${fCurrency(totalInvested)}</span></div>
    </div>
    ` : `<div class="empty-state">${iconEmptyBox()}<h3>Nenhum produto cadastrado</h3><p>Adicione os produtos e insumos utilizados nos procedimentos.</p></div>`}
  </div>`;
}

function openProdutoModal(id = null) {
  const { products } = getData();
  const p = id ? products.find(x => x.id === id) : null;
  state.editingId = id;
  openModal(id ? 'Editar Produto' : 'Novo Produto', `
    <form onsubmit="saveProduto(event)">
      <div class="form-grid">
        <div class="form-group form-full">
          <label class="form-label">Nome do Produto *</label>
          <input type="text" class="form-control" id="pName" value="${esc(p?.name || '')}" placeholder="Ex: Toxina Botulínica Allergan 100U" required />
        </div>
        <div class="form-group">
          <label class="form-label">Categoria *</label>
          <select class="form-control" id="pCategory" required>
            <option value="">Selecione…</option>
            ${Object.entries(PRODUCT_CATEGORIES).map(([k,v]) => `<option value="${k}" ${p?.category===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Fornecedor</label>
          <input type="text" class="form-control" id="pSupplier" value="${esc(p?.supplier || '')}" placeholder="Ex: Allergan" />
        </div>
        <div class="form-group">
          <label class="form-label">Quantidade *</label>
          <input type="number" class="form-control" id="pQty" value="${p?.qty || 1}" min="1" required oninput="calcProdTotal()" />
        </div>
        <div class="form-group">
          <label class="form-label">Custo Unitário (R$) *</label>
          <input type="number" class="form-control" id="pUnitCost" value="${p?.unitCost || ''}" step="0.01" min="0" placeholder="0,00" required oninput="calcProdTotal()" />
        </div>
        <div class="form-group">
          <label class="form-label">Custo Total (R$)</label>
          <input type="number" class="form-control" id="pTotalCost" value="${p?.totalCost || ''}" step="0.01" min="0" placeholder="Calculado automaticamente" />
        </div>
        <div class="form-group">
          <label class="form-label">Procedimento Relacionado</label>
          <select class="form-control" id="pProcedure">
            <option value="">Selecione…</option>
            ${Object.entries(PROCEDURES).map(([k,v]) => `<option value="${k}" ${p?.procedure===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Valor Cobrado no Procedimento (R$)</label>
          <input type="number" class="form-control" id="pProcedurePrice" value="${p?.procedurePrice || ''}" step="0.01" min="0" placeholder="Preço cobrado ao paciente" oninput="calcProdTotal()" />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="pNotes" placeholder="Ex: Rendimento ~100 unidades por frasco">${esc(p?.notes || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="saveProdutoBtn">${iconCheck()} ${id ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`);
}

function calcProdTotal() {
  const qty   = parseFloat(document.getElementById('pQty')?.value || 0);
  const unit  = parseFloat(document.getElementById('pUnitCost')?.value || 0);
  const total = document.getElementById('pTotalCost');
  if (total && qty && unit) total.value = (qty * unit).toFixed(2);
}

async function saveProduto(event) {
  event.preventDefault();
  const btn = document.getElementById('saveProdutoBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  const qty      = parseFloat(document.getElementById('pQty').value);
  const unitCost = parseFloat(document.getElementById('pUnitCost').value);
  const prod = {
    id:             state.editingId || uid(),
    name:           document.getElementById('pName').value.trim(),
    category:       document.getElementById('pCategory').value,
    supplier:       document.getElementById('pSupplier').value.trim(),
    qty, unitCost,
    totalCost:      parseFloat(document.getElementById('pTotalCost').value) || qty * unitCost,
    procedure:      document.getElementById('pProcedure').value,
    procedurePrice: parseFloat(document.getElementById('pProcedurePrice').value) || 0,
    notes:          document.getElementById('pNotes').value.trim()
  };

  const rowProd = dbProduct(prod);
  const { error } = state.editingId
    ? await db('produtos').update(rowProd).eq('id', state.editingId)
    : await db('produtos').insert(rowProd);
  if (error) { console.error('Erro produto:', error); toast('Erro: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; } return; }

  if (state.editingId) {
    const idx = state.data.products.findIndex(x => x.id === state.editingId);
    if (idx !== -1) state.data.products[idx] = prod;
    toast('Produto atualizado!', 'success');
  } else {
    state.data.products.push(prod);
    toast('Produto adicionado!', 'success');
  }
  closeModal();
  renderView('produtos');
}

async function deleteProduct(id) {
  if (!confirm('Excluir este produto?')) return;
  const { error } = await db('produtos').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  state.data.products = state.data.products.filter(x => x.id !== id);
  toast('Produto excluído.', 'success');
  renderView('produtos');
}

/* ===== NOTAS FISCAIS ===== */
function renderNotasContent() {
  const notas = getData().notas;
  const q = (state.searchTerms.notas || '').toLowerCase();
  const filtered = q ? notas.filter(n => n.number.toLowerCase().includes(q) || n.supplier.toLowerCase().includes(q) || n.description.toLowerCase().includes(q)) : notas;
  const sorted = filtered.slice().sort((a,b) => b.date.localeCompare(a.date));
  const total  = sorted.reduce((s,n) => s + n.value, 0);

  return `
  <div class="table-container">
    <div class="table-toolbar">
      <div class="table-search">${iconSearch()}
        <input type="text" placeholder="Buscar por NF, fornecedor ou descrição…" value="${esc(state.searchTerms.notas)}" oninput="setSearch('notas', this.value)" />
      </div>
      <span style="font-size:13px;color:var(--text-2)">${sorted.length} nota${sorted.length!==1?'s':''}</span>
    </div>
    ${sorted.length ? `
    <table><thead><tr>
      <th>Data</th><th>Nº NF</th><th>Fornecedor</th><th>Descrição</th><th>Obs.</th><th style="text-align:center">Arquivo</th><th style="text-align:right">Valor</th><th style="text-align:right">Ações</th>
    </tr></thead><tbody>
    ${sorted.map(n => `<tr>
      <td class="no-wrap fs-13 color-2">${fDate(n.date)}</td>
      <td><span class="badge badge-blue">${esc(n.number)}</span></td>
      <td class="fw-600 fs-13">${esc(n.supplier)}</td>
      <td class="fs-13">${esc(n.description)}</td>
      <td class="fs-13 color-2">${esc(n.notes || '—')}</td>
      <td style="text-align:center">
        ${n.fileData
          ? `<img src="${n.fileData}" class="nf-thumb" title="Ver NF" onclick="viewNota('${n.id}')" />`
          : `<span class="text-muted" style="font-size:12px">—</span>`}
      </td>
      <td style="text-align:right" class="val-red fw-600">${fCurrency(n.value)}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-icon" title="Editar"  onclick="openNotaModal('${n.id}')">${iconEdit()}</button>
        <button class="btn btn-danger btn-icon" title="Excluir" onclick="deleteNota('${n.id}')">${iconTrash()}</button>
      </div></td>
    </tr>`).join('')}
    </tbody></table>
    <div class="summary-row">
      <div class="summary-item"><span class="summary-label">Total em notas:</span><span class="summary-value val-red">${fCurrency(total)}</span></div>
    </div>
    ` : `<div class="empty-state">${iconEmptyBox()}<h3>Nenhuma nota fiscal cadastrada</h3><p>Adicione as notas fiscais dos produtos comprados.</p></div>`}
  </div>`;
}

function openNotaModal(id = null) {
  const n = id ? getData().notas.find(x => x.id === id) : null;
  state.editingId = id;
  state.pendingPhotos.nf = n?.fileData || null;
  openModal(id ? 'Editar Nota Fiscal' : 'Nova Nota Fiscal', `
    <form onsubmit="saveNota(event)">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input type="date" class="form-control" id="nDate" value="${n?.date || today()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Número da NF *</label>
          <input type="text" class="form-control" id="nNumber" value="${esc(n?.number || '')}" placeholder="Ex: NF-20481" required />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Fornecedor *</label>
          <input type="text" class="form-control" id="nSupplier" value="${esc(n?.supplier || '')}" placeholder="Ex: Allergan Farmacêutica" required />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Descrição dos Produtos *</label>
          <input type="text" class="form-control" id="nDesc" value="${esc(n?.description || '')}" placeholder="Ex: Toxina Botulínica Allergan 100U x3" required />
        </div>
        <div class="form-group">
          <label class="form-label">Valor Total (R$) *</label>
          <input type="number" class="form-control" id="nValue" value="${n?.value || ''}" step="0.01" min="0" placeholder="0,00" required />
        </div>
        <div class="form-group">
          <label class="form-label">Observações</label>
          <input type="text" class="form-control" id="nNotes" value="${esc(n?.notes || '')}" placeholder="Ex: Validade, lote…" />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Imagem da Nota Fiscal</label>
          <div class="photo-upload-slot" id="nfSlot" style="width:100%">
            <input type="file" accept="image/*" onchange="handleNFUpload(this)" />
            ${n?.fileData
              ? `<img src="${n.fileData}" class="photo-preview-img" /><span class="pu-label">Clique para trocar</span>`
              : `<span class="pu-icon">📄</span><span class="pu-label">Upload da imagem da NF</span>`}
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="saveNotaBtn">${iconCheck()} ${id ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`, true);
}

function handleNFUpload(input) {
  const file = input.files[0];
  if (!file) return;
  resizeImage(file, 900, data => {
    state.pendingPhotos.nf = data;
    const slot = document.getElementById('nfSlot');
    if (slot) slot.innerHTML = `<input type="file" accept="image/*" onchange="handleNFUpload(this)" /><img src="${data}" class="photo-preview-img" /><span class="pu-label">Clique para trocar</span>`;
  });
}

async function saveNota(event) {
  event.preventDefault();
  const btn = document.getElementById('saveNotaBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  const nota = {
    id:          state.editingId || uid(),
    date:        document.getElementById('nDate').value,
    number:      document.getElementById('nNumber').value.trim(),
    supplier:    document.getElementById('nSupplier').value.trim(),
    description: document.getElementById('nDesc').value.trim(),
    value:       parseFloat(document.getElementById('nValue').value),
    notes:       document.getElementById('nNotes').value.trim(),
    fileData:    state.pendingPhotos.nf || null
  };

  const rowNota = dbNota(nota);
  const { error } = state.editingId
    ? await db('notas_fiscais').update(rowNota).eq('id', state.editingId)
    : await db('notas_fiscais').insert(rowNota);
  if (error) { console.error('Erro nota:', error); toast('Erro: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; } return; }

  if (state.editingId) {
    const idx = state.data.notas.findIndex(x => x.id === state.editingId);
    if (idx !== -1) state.data.notas[idx] = nota;
    toast('Nota fiscal atualizada!', 'success');
  } else {
    state.data.notas.unshift(nota);
    toast('Nota fiscal adicionada!', 'success');
  }
  state.pendingPhotos.nf = null;
  closeModal();
  renderView('produtos');
}

async function deleteNota(id) {
  if (!confirm('Excluir esta nota fiscal?')) return;
  const { error } = await db('notas_fiscais').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  state.data.notas = state.data.notas.filter(x => x.id !== id);
  toast('Nota excluída.', 'success');
  renderView('produtos');
}

function viewNota(id) {
  const n = getData().notas.find(x => x.id === id);
  if (!n?.fileData) return;
  openModal(`NF ${n.number} — ${n.supplier}`,
    `<div style="text-align:center"><img src="${n.fileData}" style="max-width:100%;border-radius:8px;border:1px solid var(--border)" /></div>
     <div style="margin-top:14px;font-size:13px;color:var(--text-2);text-align:center">${esc(n.description)} • ${fCurrency(n.value)}</div>`
  );
}

/* ===== CONSULTÓRIO ===== */
function renderConsultorio() {
  const clinic = getData().clinic;
  const fc = filterClinicByPeriod(clinic);
  const q  = (state.searchTerms.consultorio || '').toLowerCase();
  const filtered = q ? fc.filter(e => e.description.toLowerCase().includes(q) || CLINIC_CATEGORIES[e.category]?.toLowerCase().includes(q)) : fc;
  const sorted = filtered.slice().sort((a,b) => b.date.localeCompare(a.date));

  const total     = sorted.reduce((s,e) => s+e.value, 0);
  const fixos     = sorted.filter(e => e.recurrence === 'mensal').reduce((s,e) => s+e.value, 0);
  const variaveis = sorted.filter(e => e.recurrence === 'pontual').reduce((s,e) => s+e.value, 0);
  const qtdCats   = new Set(sorted.map(e => e.category)).size;

  const catBadgeColors = {
    aluguel:'badge-gold', energia:'badge-red', agua:'badge-blue', internet:'badge-teal',
    telefone:'badge-purple', limpeza:'badge-green', seguranca:'badge-red',
    condominio:'badge-gold', manutencao:'badge-blue', outros:'badge-gray'
  };

  const catBreakdown = Object.entries(CLINIC_CATEGORIES)
    .map(([k,v]) => ({ key:k, label:v, val: sorted.filter(e=>e.category===k).reduce((s,e)=>s+e.value,0) }))
    .filter(x => x.val > 0).sort((a,b) => b.val - a.val);

  return `
  <div class="section-header">
    <div><div class="section-title">Consultório</div><div class="section-sub">Gastos fixos e variáveis do espaço físico da clínica</div></div>
    <button class="btn btn-primary" onclick="openConsultorioModal()">${iconPlus()} Novo Gasto</button>
  </div>
  ${periodFilterHTML()}
  <div class="stats-grid" style="margin-bottom:24px">
    ${statCard('Total no Período',   fCurrency(total),     'red',  'Todos os gastos do consultório', iconDown(),   '')}
    ${statCard('Custos Fixos',       fCurrency(fixos),     'gold', 'Mensalidades recorrentes',       iconClip(),   `<span class="stat-badge down">${sorted.filter(e=>e.recurrence==='mensal').length} itens</span>`)}
    ${statCard('Custos Variáveis',   fCurrency(variaveis), 'blue', 'Gastos pontuais',                iconTrend(),  `<span class="stat-badge up">${sorted.filter(e=>e.recurrence==='pontual').length} itens</span>`)}
    ${statCard('Categorias Ativas',  qtdCats,              'green','Tipos de gasto no período',      iconDollar(), '')}
  </div>
  ${catBreakdown.length ? `
  <div class="card" style="margin-bottom:20px">
    <div class="card-header"><span class="card-title">Resumo por Categoria</span></div>
    <div class="card-body" style="padding-top:12px">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
        ${catBreakdown.map(c => {
          const pct = total > 0 ? ((c.val / total) * 100).toFixed(1) : 0;
          return `<div style="background:var(--bg);border-radius:10px;padding:14px;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span class="badge ${catBadgeColors[c.key]||'badge-gray'}">${c.label}</span>
              <span style="font-size:11px;color:var(--text-3)">${pct}%</span>
            </div>
            <div style="font-size:16px;font-weight:700;color:var(--text-1)">${fCurrency(c.val)}</div>
            <div style="margin-top:8px;height:4px;background:var(--border);border-radius:10px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:var(--accent);border-radius:10px"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>` : ''}
  <div class="table-container">
    <div class="table-toolbar">
      <div class="table-search">${iconSearch()}
        <input type="text" placeholder="Buscar gasto…" value="${esc(state.searchTerms.consultorio||'')}" oninput="setSearch('consultorio', this.value)" />
      </div>
      <span style="font-size:13px;color:var(--text-2)">${sorted.length} registro${sorted.length!==1?'s':''}</span>
    </div>
    ${sorted.length ? `
    <table><thead><tr>
      <th>Data</th><th>Categoria</th><th>Descrição</th><th>Tipo</th><th style="text-align:right">Valor</th><th style="text-align:right">Ações</th>
    </tr></thead><tbody>
    ${sorted.map(e => `<tr>
      <td class="no-wrap fs-13 color-2">${fDate(e.date)}</td>
      <td><span class="badge ${catBadgeColors[e.category]||'badge-gray'}">${CLINIC_CATEGORIES[e.category]||e.category}</span></td>
      <td class="fw-600">${esc(e.description)}</td>
      <td>${e.recurrence === 'mensal' ? '<span class="badge badge-blue">Mensal</span>' : '<span class="badge badge-gray">Pontual</span>'}</td>
      <td style="text-align:right" class="val-red fw-600">${fCurrency(e.value)}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-icon" title="Editar"  onclick="openConsultorioModal('${e.id}')">${iconEdit()}</button>
        <button class="btn btn-danger btn-icon" title="Excluir" onclick="deleteClinic('${e.id}')">${iconTrash()}</button>
      </div></td>
    </tr>`).join('')}
    </tbody></table>
    <div class="summary-row">
      <div class="summary-item"><span class="summary-label">Total no período:</span><span class="summary-value val-red">${fCurrency(total)}</span></div>
      <div class="summary-item"><span class="summary-label">Fixos:</span><span class="summary-value">${fCurrency(fixos)}</span></div>
      <div class="summary-item"><span class="summary-label">Variáveis:</span><span class="summary-value">${fCurrency(variaveis)}</span></div>
    </div>
    ` : `<div class="empty-state">${iconEmptyBox()}<h3>Nenhum gasto encontrado</h3><p>Adicione os gastos do consultório como aluguel, energia, água, etc.</p></div>`}
  </div>`;
}

function openConsultorioModal(id = null) {
  const clinic = getData().clinic;
  const e = id ? clinic.find(x => x.id === id) : null;
  state.editingId = id;
  openModal(id ? 'Editar Gasto' : 'Novo Gasto do Consultório', `
    <form onsubmit="saveConsultorio(event)">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input type="date" class="form-control" id="cDate" value="${e?.date || today()}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Categoria *</label>
          <select class="form-control" id="cCategory" required>
            <option value="">Selecione…</option>
            ${Object.entries(CLINIC_CATEGORIES).map(([k,v]) => `<option value="${k}" ${e?.category===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
        <div class="form-group form-full">
          <label class="form-label">Descrição *</label>
          <input type="text" class="form-control" id="cDesc" value="${esc(e?.description || '')}" placeholder="Ex: Conta de energia elétrica — Abril" required />
        </div>
        <div class="form-group">
          <label class="form-label">Valor (R$) *</label>
          <input type="number" class="form-control" id="cValue" value="${e?.value || ''}" step="0.01" min="0" placeholder="0,00" required />
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Gasto *</label>
          <select class="form-control" id="cRecurrence" required>
            <option value="mensal"  ${(!e || e.recurrence === 'mensal')  ? 'selected' : ''}>Mensal (fixo)</option>
            <option value="pontual" ${e?.recurrence === 'pontual' ? 'selected' : ''}>Pontual (variável)</option>
          </select>
        </div>
        <div class="form-group form-full">
          <p class="form-hint">Gastos <strong>mensais (fixos)</strong> aparecem em todos os meses e geram aviso de vencimento. O <strong>dia da data</strong> acima é usado como dia de vencimento (ex.: todo dia 05).</p>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="saveClinicBtn">${iconCheck()} ${id ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`);
}

async function saveConsultorio(event) {
  event.preventDefault();
  const btn = document.getElementById('saveClinicBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  const item = {
    id:          state.editingId || uid(),
    date:        document.getElementById('cDate').value,
    category:    document.getElementById('cCategory').value,
    description: document.getElementById('cDesc').value.trim(),
    value:       parseFloat(document.getElementById('cValue').value),
    recurrence:  document.getElementById('cRecurrence').value
  };

  const rowClinic = dbClinic(item);
  const { error } = state.editingId
    ? await db('consultorio').update(rowClinic).eq('id', state.editingId)
    : await db('consultorio').insert(rowClinic);
  if (error) { console.error('Erro consultório:', error); toast('Erro: ' + error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; } return; }

  if (state.editingId) {
    const idx = state.data.clinic.findIndex(x => x.id === state.editingId);
    if (idx !== -1) state.data.clinic[idx] = item;
    toast('Gasto atualizado!', 'success');
  } else {
    state.data.clinic.unshift(item);
    toast('Gasto adicionado!', 'success');
  }
  closeModal();
  renderView('consultorio');
  updateNotifBadge();
}

async function deleteClinic(id) {
  if (!confirm('Excluir este gasto?')) return;
  const { error } = await db('consultorio').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  state.data.clinic = state.data.clinic.filter(x => x.id !== id);
  toast('Gasto excluído.', 'success');
  renderView('consultorio');
  updateNotifBadge();
}

/* ===== MARGEM ===== */
function renderMargem() {
  const { entries, exits, products, clinic, entradaInsumos, pricing } = getData();
  const fe = filterByPeriod(entries);
  const fx = filterByPeriod(exits);
  const fc = filterClinicByPeriod(clinic);

  const cards = Object.entries(PROCEDURES).map(([key, name]) => {
    const procEntries = fe.filter(e => e.procedure === key);
    const revenue     = procEntries.reduce((s,e) => s+e.value, 0);
    const count       = procEntries.length;
    // Lucro Bruto: custo de produtos do catálogo
    const costCatalog = products.filter(p => p.procedure === key).reduce((s,p) => s+p.totalCost, 0);
    const profitBruto = revenue - costCatalog;
    const marginBruto = revenue > 0 ? ((profitBruto / revenue) * 100) : 0;
    // Lucro Real: insumos realmente usados nas entradas
    const entradaIds  = procEntries.map(e => e.id);
    const realCost    = entradaInsumos.filter(ei => entradaIds.includes(ei.entradaId))
                          .reduce((s,ei) => s + ei.qtyUsed * ei.unitCost, 0);
    const profitReal  = revenue - realCost;
    const marginReal  = revenue > 0 ? ((profitReal / revenue) * 100) : 0;
    const hasRealData = entradaIds.some(id => entradaInsumos.find(ei => ei.entradaId === id));
    const pricingConf = pricing.find(p => p.procedure === key);
    return { key, name, revenue, costCatalog, profitBruto, marginBruto, realCost, profitReal, marginReal, count, hasRealData, pricingConf };
  }).filter(x => x.revenue > 0 || x.count > 0).sort((a,b) => b.marginBruto - a.marginBruto);

  const totalRevenue  = fe.reduce((s,e) => s+e.value, 0);
  const totalProdCost = cards.reduce((s,c) => s+c.costCatalog, 0);
  const totalSaidas   = fx.reduce((s,e) => s+e.value, 0);
  const totalClinic   = fc.reduce((s,e) => s+e.value, 0);
  const totalExpenses = totalProdCost + totalSaidas + totalClinic;
  const totalProfit   = totalRevenue - totalExpenses;
  const netMargin     = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

  return `
  <div class="section-header">
    <div><div class="section-title">Margem de Lucro</div>
    <div class="section-sub">Lucro Bruto (catálogo) vs Lucro Real (insumos registrados)</div></div>
    <button class="btn btn-secondary btn-sm" onclick="navigateTo('precificacao')">${iconDollar()} Precificação</button>
  </div>
  ${periodFilterHTML()}
  <div class="stats-grid" style="margin-bottom:24px">
    ${statCard('Receita Total',   fCurrency(totalRevenue),  'green', 'Total de entradas',               iconTrend(), '')}
    ${statCard('Despesas Totais', fCurrency(totalExpenses), 'red',   'Produtos + Saídas + Consultório', iconDown(),  `<span style="font-size:11px;color:var(--text-2)">Prod: ${fCurrency(totalProdCost)} · Saídas: ${fCurrency(totalSaidas)} · Consul.: ${fCurrency(totalClinic)}</span>`)}
    ${statCard('Lucro Líquido',   fCurrency(totalProfit),   totalProfit>=0?'gold':'red', 'Receita menos todas as despesas', iconDollar(), '')}
    ${statCard('Margem Líquida',  `${netMargin}%`,          'blue',  'Margem real do negócio',          iconClip(),  '')}
  </div>
  ${cards.length ? `<div class="margem-grid">
    ${cards.map(c => {
      const barColor   = c.marginBruto>=60?'#5E8C61':c.marginBruto>=40?'#C9A06A':c.marginBruto>=20?'#6E8595':'#B85C44';
      const badgeColor = c.marginBruto>=60?'badge-green':c.marginBruto>=40?'badge-gold':c.marginBruto>=20?'badge-blue':'badge-red';
      const realColor  = c.marginReal>=60?'#5E8C61':c.marginReal>=40?'#C9A06A':c.marginReal>=20?'#6E8595':'#B85C44';
      return `<div class="margem-card">
        <div class="margem-card-header">
          <span class="margem-procedure">${c.name}</span>
          <span class="badge ${badgeColor}" style="font-size:15px">${c.marginBruto.toFixed(1)}%</span>
        </div>
        <div class="margem-row"><span class="margem-key">Faturamento</span><span class="margem-val val-green">${fCurrency(c.revenue)}</span></div>
        <div class="margem-row"><span class="margem-key">Custo c/ produtos (catálogo)</span><span class="margem-val val-red">${fCurrency(c.costCatalog)}</span></div>
        <div class="margem-row" style="font-weight:700"><span class="margem-key">Lucro Bruto</span><span class="margem-val" style="color:${barColor}">${fCurrency(c.profitBruto)}</span></div>
        <div class="margem-divider-sm"></div>
        ${c.hasRealData
          ? `<div class="margem-row"><span class="margem-key">Insumos reais consumidos</span><span class="margem-val val-red">${fCurrency(c.realCost)}</span></div>
             <div class="margem-row" style="font-weight:700"><span class="margem-key">Lucro Real</span><span class="margem-val" style="color:${realColor}">${fCurrency(c.profitReal)} <span style="font-size:11px">(${c.marginReal.toFixed(1)}%)</span></span></div>`
          : `<div class="margem-row"><span class="margem-key" style="font-style:italic;font-size:12px;color:var(--text-3)">Lucro Real — registre insumos nas entradas</span><span class="margem-val" style="color:var(--text-3)">—</span></div>`}
        <div class="margem-row" style="margin-top:4px"><span class="margem-key">Qtd. procedimentos</span><span class="margem-val">${c.count}</span></div>
        ${c.pricingConf ? `<div class="margem-row"><span class="margem-key">Preço alvo</span><span class="margem-val val-green">${fCurrency(c.pricingConf.targetPrice)}</span></div>` : ''}
        <div class="margem-progress"><div class="margem-bar" style="width:${Math.min(100,Math.max(0,c.marginBruto))}%;background:${barColor}"></div></div>
      </div>`;
    }).join('')}
  </div>` : `<div class="card"><div class="empty-state">${iconEmptyBox()}<h3>Sem dados para o período</h3><p>Adicione entradas para ver a margem de lucro por procedimento.</p></div></div>`}`;
}

/* ===== PRECIFICAÇÃO ===== */
function renderPrecificacao() {
  const { pricing, pricingInsumos, products } = getData();
  const rows = Object.entries(PROCEDURES).map(([key, name]) => {
    const conf    = pricing.find(p => p.procedure === key);
    const insumos = conf
      ? pricingInsumos.filter(pi => pi.precificacaoId === conf.id).map(pi => {
          const prod = products.find(p => p.id === pi.produtoId);
          return { ...pi, prodName: prod?.name || '—', prodUnitCost: prod?.unitCost || 0 };
        })
      : [];
    const totalCost = insumos.reduce((s,i) => s + i.qtyUsed * i.prodUnitCost, 0);
    const margin    = conf?.targetPrice > 0 ? (((conf.targetPrice - totalCost) / conf.targetPrice) * 100).toFixed(1) : null;
    return { key, name, conf, insumos, totalCost, margin };
  });

  return `
  <div class="section-header">
    <div><div class="section-title">Precificação</div>
    <div class="section-sub">Configure preços e insumos de cada procedimento para calcular margens reais</div></div>
  </div>
  <div class="pricing-grid">
    ${rows.map(r => {
      const barColor   = r.margin !== null ? (r.margin >= 60 ? '#5E8C61' : r.margin >= 40 ? '#C9A06A' : r.margin >= 20 ? '#6E8595' : '#B85C44') : 'var(--border)';
      const badgeClass = r.margin !== null ? (r.margin >= 60 ? 'badge-green' : r.margin >= 40 ? 'badge-gold' : r.margin >= 20 ? 'badge-blue' : 'badge-red') : '';
      return `<div class="pricing-card">
        <div class="pricing-card-header">
          <div>
            <div class="pricing-procedure">${r.name}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:2px">${r.conf ? `${r.conf.estimatedTime} min · Mín: ${fCurrency(r.conf.minPrice)}` : 'Não configurado'}</div>
          </div>
          <div style="text-align:right">
            ${r.conf ? `<div style="font-size:18px;font-weight:800;color:var(--text-1)">${fCurrency(r.conf.targetPrice)}</div>` : `<div style="font-size:13px;color:var(--text-3)">—</div>`}
            ${r.margin !== null ? `<div class="badge ${badgeClass}" style="font-size:12px;margin-top:4px">${r.margin}% margem</div>` : ''}
          </div>
        </div>
        ${r.insumos.length ? `
        <div class="pricing-insumos-list">
          ${r.insumos.map(i => `
            <div class="pricing-insumo-row">
              <span class="pricing-insumo-name">${esc(i.prodName)}</span>
              <span class="pricing-insumo-qty">${i.qtyUsed}x</span>
              <span class="pricing-insumo-cost val-red">${fCurrency(i.qtyUsed * i.prodUnitCost)}</span>
            </div>`).join('')}
          <div class="pricing-insumo-row" style="border-top:1px solid var(--border);padding-top:6px;margin-top:4px">
            <span class="pricing-insumo-name fw-600">Custo total de insumos</span>
            <span></span>
            <span class="val-red fw-600">${fCurrency(r.totalCost)}</span>
          </div>
        </div>` : `<div style="font-size:12px;color:var(--text-3);padding:8px 0;font-style:italic">Nenhum insumo cadastrado</div>`}
        ${r.conf?.notes ? `<div style="font-size:12px;color:var(--text-2);margin-top:8px;padding:8px;background:var(--bg);border-radius:8px">${esc(r.conf.notes)}</div>` : ''}
        <div style="margin-top:12px">
          <div style="height:4px;background:var(--border);border-radius:10px;overflow:hidden;margin-bottom:10px">
            <div style="width:${r.margin!==null?Math.min(100,Math.max(0,r.margin)):0}%;height:100%;background:${barColor};border-radius:10px"></div>
          </div>
          <button class="btn btn-secondary btn-sm" style="width:100%" onclick="openPrecificacaoModal('${r.key}')">
            ${iconEdit()} ${r.conf ? 'Editar' : 'Configurar'}
          </button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function openPrecificacaoModal(procedureKey) {
  const { pricing, pricingInsumos, products } = getData();
  const conf    = pricing.find(p => p.procedure === procedureKey);
  const insumos = conf ? pricingInsumos.filter(pi => pi.precificacaoId === conf.id) : [];

  const insumosRows = insumos.map((pi, idx) => `
    <div class="pi-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <select class="form-control" name="pi_produto_${idx}" style="flex:1">
        <option value="">Selecione produto…</option>
        ${products.map(p => `<option value="${p.id}" ${p.id===pi.produtoId?'selected':''}>${esc(p.name)} (${fCurrency(p.unitCost)}/un)</option>`).join('')}
      </select>
      <input type="number" class="form-control" name="pi_qty_${idx}" value="${pi.qtyUsed}" min="0.01" step="0.01" style="width:80px" placeholder="Qtd" />
      <button type="button" class="btn btn-danger btn-icon btn-sm" onclick="removePiRow(this)">${iconTrash()}</button>
    </div>`).join('');

  openModal(`Precificação — ${PROCEDURES[procedureKey]}`, `
    <form onsubmit="savePrecificacao(event)">
      <input type="hidden" id="pc_procedure" value="${procedureKey}" />
      <input type="hidden" id="pc_id" value="${conf?.id || ''}" />
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Preço Alvo (R$) *</label>
          <input type="number" class="form-control" id="pc_targetPrice" value="${conf?.targetPrice || ''}" step="0.01" min="0" placeholder="0,00" required />
        </div>
        <div class="form-group">
          <label class="form-label">Preço Mínimo (R$)</label>
          <input type="number" class="form-control" id="pc_minPrice" value="${conf?.minPrice || ''}" step="0.01" min="0" placeholder="0,00" />
        </div>
        <div class="form-group">
          <label class="form-label">Tempo Estimado (min)</label>
          <input type="number" class="form-control" id="pc_time" value="${conf?.estimatedTime || 60}" min="5" step="5" />
        </div>
        <div class="form-group form-full">
          <label class="form-label">Observações</label>
          <textarea class="form-control" id="pc_notes" rows="2" placeholder="Ex: inclui anestésico tópico">${esc(conf?.notes || '')}</textarea>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);margin:16px 0"></div>
      <div style="font-size:13px;font-weight:700;color:var(--text-1);margin-bottom:12px">Insumos deste Procedimento</div>
      <div id="piRowsContainer">${insumosRows}</div>
      <button type="button" class="btn btn-secondary btn-sm" style="margin-top:4px" onclick="addPiRow()">
        ${iconPlus()} Adicionar Insumo
      </button>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="savePricingBtn">${iconCheck()} Salvar</button>
      </div>
    </form>`, true);
}

function addPiRow() {
  const { products } = getData();
  const container = document.getElementById('piRowsContainer');
  if (!container) return;
  const idx = container.querySelectorAll('.pi-row').length;
  const div = document.createElement('div');
  div.className = 'pi-row';
  div.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px';
  div.innerHTML = `
    <select class="form-control" name="pi_produto_${idx}" style="flex:1">
      <option value="">Selecione produto…</option>
      ${products.map(p => `<option value="${p.id}">${esc(p.name)} (${fCurrency(p.unitCost)}/un)</option>`).join('')}
    </select>
    <input type="number" class="form-control" name="pi_qty_${idx}" value="1" min="0.01" step="0.01" style="width:80px" placeholder="Qtd" />
    <button type="button" class="btn btn-danger btn-icon btn-sm" onclick="removePiRow(this)">${iconTrash()}</button>`;
  container.appendChild(div);
}

function removePiRow(btn) { btn.closest('.pi-row').remove(); }

async function savePrecificacao(event) {
  event.preventDefault();
  const btn = document.getElementById('savePricingBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  const procedureKey = document.getElementById('pc_procedure').value;
  const existingId   = document.getElementById('pc_id').value || null;
  const pricingId    = existingId || uid();

  const pricingRow = {
    id: pricingId, procedure: procedureKey,
    targetPrice:   parseFloat(document.getElementById('pc_targetPrice').value) || 0,
    minPrice:      parseFloat(document.getElementById('pc_minPrice').value)    || 0,
    estimatedTime: parseInt(document.getElementById('pc_time').value)          || 60,
    notes:         document.getElementById('pc_notes').value.trim()
  };

  const { error: pcErr } = existingId
    ? await db('precificacao').update(dbPricing(pricingRow)).eq('id', existingId)
    : await db('precificacao').insert(dbPricing(pricingRow));
  if (pcErr) { toast('Erro: ' + pcErr.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; } return; }

  // Coletar insumos do DOM ANTES de fechar o modal
  const piRows = document.getElementById('piRowsContainer').querySelectorAll('.pi-row');
  const newInsumos = [];
  piRows.forEach(row => {
    const prodSel = row.querySelector('select');
    const qtyInp  = row.querySelector('input[type="number"]');
    if (prodSel?.value && qtyInp?.value)
      newInsumos.push({ id: uid(), precificacaoId: pricingId, produtoId: prodSel.value, qtyUsed: parseFloat(qtyInp.value) || 1 });
  });

  // Atualizar cache local imediatamente
  if (existingId) {
    const idx = state.data.pricing.findIndex(p => p.id === existingId);
    if (idx !== -1) state.data.pricing[idx] = pricingRow;
    state.data.pricingInsumos = state.data.pricingInsumos.filter(pi => pi.precificacaoId !== existingId);
  } else {
    state.data.pricing.push(pricingRow);
  }
  state.data.pricingInsumos.push(...newInsumos);

  // Fechar modal e renderizar IMEDIATAMENTE (sem esperar queries de insumos)
  toast('Precificação salva!', 'success');
  closeModal();
  renderView('precificacao');

  // Salvar insumos no banco em background (não bloqueia a UI)
  if (existingId && newInsumos.length >= 0) {
    db('precificacao_insumos').delete().eq('precificacao_id', existingId).then(() => {
      if (newInsumos.length)
        db('precificacao_insumos').insert(newInsumos.map(dbPricingInsumo)).then(({ error }) => {
          if (error) console.warn('Erro ao salvar insumos de precificação:', error.message);
        });
    });
  } else if (newInsumos.length) {
    db('precificacao_insumos').insert(newInsumos.map(dbPricingInsumo)).then(({ error }) => {
      if (error) console.warn('Erro ao salvar insumos de precificação:', error.message);
    });
  }
}

/* ===== GRÁFICOS ===== */
function renderGraficos() {
  return `
  <div class="section-header">
    <div><div class="section-title">Gráficos & Relatórios</div><div class="section-sub">Visão completa dos dados financeiros</div></div>
  </div>
  ${periodFilterHTML()}
  <div class="graficos-grid">
    <div class="card card-full">
      <div class="card-header"><span class="card-title">Evolução Mensal — Receita × Despesa × Lucro</span><span class="card-sub">Últimos 6 meses</span></div>
      <div class="chart-wrap"><canvas id="gChartLine" height="220"></canvas></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Procedimentos por Receita</span><span class="card-sub">No período selecionado</span></div>
      <div class="chart-wrap"><canvas id="gChartProc" height="280"></canvas></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Gastos por Categoria</span><span class="card-sub">No período selecionado</span></div>
      <div class="chart-wrap"><canvas id="gChartCat" height="280"></canvas></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Formas de Pagamento</span><span class="card-sub">No período selecionado</span></div>
      <div class="chart-wrap"><canvas id="gChartPay" height="280"></canvas></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Margem por Procedimento</span><span class="card-sub">No período selecionado</span></div>
      <div class="chart-wrap"><canvas id="gChartMargin" height="280"></canvas></div>
    </div>
  </div>`;
}

function initGraficosCharts() {
  const { entries, exits, products, clinic } = getData();
  const fe = filterByPeriod(entries);
  const fx = filterByPeriod(exits);
  const fc = filterClinicByPeriod(clinic);
  Chart.defaults.font.family = 'DM Sans, sans-serif';
  Chart.defaults.color = '#64748B';

  const monthly = getMonthlyData(entries, exits, clinic, 6, products);
  createChart('gChartLine', {
    type: 'line',
    data: {
      labels: monthly.map(m => m.label),
      datasets: [
        { label:'Receita',  data: monthly.map(m=>m.revenue),  borderColor:'#5E8C61', backgroundColor:'rgba(94,140,97,0.08)',  fill:true, tension:0.3, borderWidth:2.5, pointRadius:4, pointBackgroundColor:'#5E8C61' },
        { label:'Despesas', data: monthly.map(m=>m.expenses), borderColor:'#B85C44', backgroundColor:'rgba(184,92,68,0.05)',   fill:true, tension:0.3, borderWidth:2.5, pointRadius:4, pointBackgroundColor:'#B85C44' },
        { label:'Lucro',    data: monthly.map(m=>m.profit),   borderColor:'#C9A06A', backgroundColor:'rgba(201,160,106,0.06)',  fill:true, tension:0.3, borderWidth:2.5, pointRadius:4, pointBackgroundColor:'#C9A06A' }
      ]
    },
    options: { responsive:true, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, padding:16 } }, tooltip:{ callbacks:{ label: ctx => ` ${ctx.dataset.label}: ${fCurrency(ctx.raw)}` } } }, scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:'rgba(0,0,0,0.04)' }, ticks:{ callback: v => fCurrency(v) } } } }
  });

  const procData = Object.entries(PROCEDURES).map(([k,v]) => ({ label:v, val: fe.filter(e=>e.procedure===k).reduce((s,e)=>s+e.value,0) })).filter(x=>x.val>0).sort((a,b)=>b.val-a.val);
  createChart('gChartProc', {
    type:'bar',
    data:{ labels: procData.map(p=>p.label), datasets:[{ label:'Receita', data: procData.map(p=>p.val), backgroundColor:['#5E8C61','#6E8595','#94808C','#C9A06A','#B85C44','#8A7B4E','#B07D3F'], borderRadius:8 }] },
    options:{ indexAxis:'y', responsive:true, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => ` ${fCurrency(ctx.raw)}` } } }, scales:{ x:{ grid:{ color:'rgba(0,0,0,0.04)' }, ticks:{ callback: v => fCurrency(v) } }, y:{ grid:{ display:false } } } }
  });

  // Despesas por categoria (saídas + consultório + produtos)
  const expProductsG = products.reduce((s,p) => s + p.totalCost, 0);
  const catLabels = [...Object.values(EXIT_CATEGORIES), 'Consultório', 'Produtos (catálogo)'];
  const catData   = [
    ...Object.keys(EXIT_CATEGORIES).map(k => fx.filter(e=>e.category===k).reduce((s,e)=>s+e.value,0)),
    fc.reduce((s,e)=>s+e.value,0),
    expProductsG
  ];
  createChart('gChartCat', {
    type:'doughnut',
    data:{ labels: catLabels, datasets:[{ data: catData, backgroundColor:['#B85C44','#C9A06A','#6E8595','#94808C','#8A7B4E','#7F6658','#B3907A'], borderWidth:2, borderColor:'#fff', hoverOffset:6 }] },
    options:{ responsive:true, cutout:'58%', plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, padding:14 } }, tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${fCurrency(ctx.raw)}` } } } }
  });

  const payLabels = Object.values(PAYMENT_METHODS);
  const payData   = Object.keys(PAYMENT_METHODS).map(k => fe.filter(e=>e.payment===k).reduce((s,e)=>s+e.value,0));
  createChart('gChartPay', {
    type:'doughnut',
    data:{ labels: payLabels, datasets:[{ data: payData, backgroundColor:['#5E8C61','#6E8595','#C9A06A','#94808C'], borderWidth:2, borderColor:'#fff', hoverOffset:6 }] },
    options:{ responsive:true, cutout:'58%', plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, padding:14 } }, tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${fCurrency(ctx.raw)}` } } } }
  });

  const totalRev     = fe.reduce((s,e)=>s+e.value,0);
  const totalClinicG = fc.reduce((s,e)=>s+e.value,0);
  const totalSaidasG = fx.reduce((s,e)=>s+e.value,0);
  const margins = Object.entries(PROCEDURES).map(([k,v]) => {
    const rev   = fe.filter(e=>e.procedure===k).reduce((s,e)=>s+e.value,0);
    const share = totalRev > 0 ? rev/totalRev : 0;
    const cost  = products.filter(p=>p.procedure===k).reduce((s,p)=>s+p.totalCost,0)
                + (share * (totalClinicG + totalSaidasG));
    return { label:v, margin: rev > 0 ? ((rev-cost)/rev*100) : 0 };
  }).filter(x => x.margin !== 0);
  createChart('gChartMargin', {
    type:'bar',
    data:{ labels: margins.map(m=>m.label), datasets:[{ label:'Margem %', data: margins.map(m=>parseFloat(m.margin.toFixed(1))), backgroundColor: margins.map(m=>m.margin>=60?'#5E8C61':m.margin>=40?'#C9A06A':m.margin>=20?'#6E8595':'#B85C44'), borderRadius:8 }] },
    options:{ responsive:true, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => ` ${ctx.raw}%` } } }, scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:'rgba(0,0,0,0.04)' }, ticks:{ callback: v => v+'%' }, max:100, min:0 } } }
  });
}

/* ===== PERFIL ===== */
function renderPerfil() {
  const email      = currentUser?.email || '';
  const cpf        = currentProfile.cpf         || '';
  const firstName  = currentProfile.first_name  || '';
  const lastName   = currentProfile.last_name   || '';
  const specialty  = currentProfile.specialty   || '';
  const avatarData = currentProfile.avatar_data || '';
  const fullName   = [firstName, lastName].filter(Boolean).join(' ') || '—';
  const initials   = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase() || '?';

  const SPECIALTIES = [
    'Biomédica Esteta','Dermatologista','Enfermeira Esteta','Médica Esteta',
    'Farmacêutica Esteta','Dentista Esteta','Fisioterapeuta Esteta','Outra'
  ];

  return `
  <div class="section-header">
    <div><div class="section-title">Meu Perfil</div><div class="section-sub">Gerencie sua foto, informações e conta</div></div>
  </div>
  <div class="perfil-layout">

    <!-- Card lateral: avatar + resumo -->
    <div class="perfil-avatar-card">
      <div class="perfil-avatar-wrap">
        <div class="perfil-avatar-img" id="pfAvatarDisp">
          ${avatarData ? `<img src="${avatarData}" alt="Foto" />` : initials}
        </div>
        <label class="perfil-avatar-edit" title="Trocar foto">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <input type="file" accept="image/*" onchange="handlePerfilPhoto(this)" />
        </label>
      </div>
      <div class="perfil-display-name">${esc(fullName)}</div>
      <div class="perfil-display-email">${esc(email)}</div>
      ${specialty ? `<div class="perfil-display-specialty">${esc(specialty)}</div>` : ''}
      <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:4px" onclick="handleLogout()">
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sair da Conta
      </button>
    </div>

    <!-- Formulário de edição -->
    <div class="perfil-form-card">
      <form onsubmit="savePerfil(event)">

        <!-- Informações Pessoais -->
        <div class="perfil-form-section">
          <div class="perfil-section-title">Informações Pessoais</div>
          <div class="perfil-section-sub">Estes dados aparecem no sidebar e nos relatórios PDF</div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Nome *</label>
              <input type="text" class="form-control" id="pfFirstName" value="${esc(firstName)}" placeholder="Ex: Ana" />
            </div>
            <div class="form-group">
              <label class="form-label">Sobrenome *</label>
              <input type="text" class="form-control" id="pfLastName"  value="${esc(lastName)}"  placeholder="Ex: Oliveira" />
            </div>
            <div class="form-group">
              <label class="form-label">Especialidade</label>
              <select class="form-control" id="pfSpecialty">
                <option value="">Selecione…</option>
                ${SPECIALTIES.map(s => `<option value="${s}" ${specialty===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">E-mail</label>
              <div class="perfil-readonly">${esc(email)}</div>
            </div>
            ${cpf ? `
            <div class="form-group">
              <label class="form-label">CPF</label>
              <div class="perfil-readonly">${esc(cpf)}</div>
            </div>` : ''}
          </div>
        </div>

        <!-- Ações -->
        <div class="perfil-form-section" style="background:#FAFBFD">
          <div style="display:flex;gap:12px;justify-content:flex-end">
            <button type="submit" class="btn btn-primary" id="savePerfilBtn">
              ${iconCheck()} Salvar Alterações
            </button>
          </div>
        </div>

      </form>

      <!-- Zona de Perigo -->
      <div class="perfil-form-section" style="border-top:1px solid rgba(184,92,68,0.15)">
        <div class="perfil-section-title" style="color:#B85C44">Zona de Perigo</div>
        <div class="perfil-section-sub">Ação irreversível — seus dados serão perdidos.</div>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteAccount()">
          Excluir minha conta permanentemente
        </button>
      </div>
    </div>

  </div>`;
}

function handlePerfilPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  resizeImage(file, 400, data => {
    state.pendingPhotos._perfilAvatar = data;
    const disp = document.getElementById('pfAvatarDisp');
    if (disp) disp.innerHTML = `<img src="${data}" alt="Foto" />`;
  });
}

async function savePerfil(event) {
  event.preventDefault();
  const btn = document.getElementById('savePerfilBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;margin-right:6px"></div>Salvando…'; }

  const firstName = document.getElementById('pfFirstName').value.trim();
  const lastName  = document.getElementById('pfLastName').value.trim();
  const specialty = document.getElementById('pfSpecialty').value;
  const avatarData = state.pendingPhotos._perfilAvatar || currentProfile.avatar_data || '';

  // Só inclui avatar se mudou (evita enviar base64 grande sem necessidade)
  const payload = {
    id:           currentUser.id,
    first_name:   firstName,
    last_name:    lastName,
    specialty:    specialty,
    updated_at:   new Date().toISOString()
  };
  if (state.pendingPhotos._perfilAvatar) {
    payload.avatar_data = state.pendingPhotos._perfilAvatar;
  }

  const { error } = await db('profiles').upsert(payload, { onConflict: 'id' });
  if (btn) { btn.disabled = false; btn.innerHTML = iconCheck() + ' Salvar Alterações'; }
  if (error) { toast('Erro ao salvar perfil: ' + error.message, 'error'); return; }

  currentProfile = { ...currentProfile, ...payload };
  state.pendingPhotos._perfilAvatar = null;
  updateSidebarProfile();
  toast('Perfil atualizado com sucesso!', 'success');
}

function confirmDeleteAccount() {
  if (prompt('Para confirmar, digite "EXCLUIR" em maiúsculas:') === 'EXCLUIR') {
    toast('Recurso disponível em breve. Entre em contato com o suporte.', 'error');
  }
}

/* ===== MODAL ===== */
function openModal(title, body, wide = false) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML    = body;
  document.getElementById('modal').className        = 'modal' + (wide ? ' modal-lg' : '');
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(initDatePickers, 10);
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  state.editingId = null;
}
function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

/* ===== TOAST ===== */
function toast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${type === 'success' ? '✓' : '✗'} ${msg}`;
  container.appendChild(el);
  setTimeout(() => { el.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => el.remove(), 300); }, 3500);
}

/* ===== SIDEBAR ===== */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* ===== SIDEBAR COLLAPSE (desktop) ===== */
function toggleSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const isCollapsed = sidebar.classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed', isCollapsed);
  localStorage.setItem('cf-sidebar-collapsed', isCollapsed ? '1' : '');
}
function initSidebarState() {
  if (localStorage.getItem('cf-sidebar-collapsed') === '1') {
    document.getElementById('sidebar').classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
  }
}

/* ===== SEARCH ===== */
function setSearch(key, val) {
  state.searchTerms[key] = val;
  renderView(state.currentView);
}

/* ===== BADGE HELPERS ===== */
function badgeProcedure(key) {
  const colors = { botox:'badge-blue', preenchimento_labial:'badge-purple', olheiras:'badge-teal', fios_pdo:'badge-green', rinomodelacao:'badge-gold', harmonizacao:'badge-red', outros:'badge-gray' };
  return `<span class="badge ${colors[key]||'badge-gray'}">${PROCEDURES[key]||key}</span>`;
}
function badgePayment(key) {
  const colors = { pix:'badge-green', dinheiro:'badge-gold', debito:'badge-blue', credito:'badge-purple' };
  return `<span class="badge ${colors[key]||'badge-gray'}">${PAYMENT_METHODS[key]||key}</span>`;
}
function badgeCategory(key) {
  const colors = { produtos_insumos:'badge-red', aluguel:'badge-gold', cursos:'badge-blue', equipamentos:'badge-purple', outros:'badge-gray',
    energia:'badge-gold', agua:'badge-blue', internet:'badge-teal', telefone:'badge-teal', limpeza:'badge-gray', seguranca:'badge-purple', condominio:'badge-gold', manutencao:'badge-red' };
  const label = EXIT_CATEGORIES[key] || CLINIC_CATEGORIES[key] || key;
  return `<span class="badge ${colors[key]||'badge-gray'}">${label}</span>`;
}
function badgeProductCategory(key) {
  const colors = { toxina:'badge-red', acido_hialuronico:'badge-blue', fios:'badge-teal', anestesico:'badge-gold', descartaveis:'badge-gray', equipamento:'badge-purple', outros:'badge-gray' };
  return `<span class="badge ${colors[key]||'badge-gray'}">${PRODUCT_CATEGORIES[key]||key}</span>`;
}

/* ===== ICON HELPERS ===== */
const svg = (d, extra='') => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const iconPlus     = () => svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');
const iconEdit     = () => svg('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>');
const iconTrash    = () => svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>');
const iconCheck    = () => svg('<polyline points="20 6 9 17 4 12"/>');
const iconSearch   = () => svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 'width="14" height="14"');
const iconTrend    = () => svg('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>');
const iconDown     = () => svg('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>');
const iconDollar   = () => svg('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>');
const iconClip     = () => svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>');
const iconEmptyBox = () => svg('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>', 'width="48" height="48"');
const iconCamera   = () => svg('<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>');
const iconDownload = () => svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');

/* ===== PDF EXPORT ===== */
function generatePDF(label) {
  if (!window.jspdf) { toast('Biblioteca PDF não carregada.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  const origPeriod = state.filter.period;
  if (label === 'Semanal') state.filter.period = 'week';
  if (label === 'Mensal')  state.filter.period = 'month';

  const { entries, exits, clinic, products } = getData();
  const fe = filterByPeriod(entries);
  const fx = filterByPeriod(exits);
  const fc = filterClinicByPeriod(clinic);
  const { s, e } = getDateRange();
  state.filter.period = origPeriod;

  const revenue      = fe.reduce((t,x) => t+x.value, 0);
  const expSaidasPdf = fx.reduce((t,x) => t+x.value, 0);
  const expClinicPdf = fc.reduce((t,x) => t+x.value, 0);
  const expProdsPdf  = products.reduce((t,p) => t+p.totalCost, 0);
  const expenses     = expSaidasPdf + expClinicPdf + expProdsPdf;
  const profit       = revenue - expenses;
  const margin   = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';
  const periodStr = `${s.toLocaleDateString('pt-BR')} a ${e.toLocaleDateString('pt-BR')}`;

  const C_DARK  = [13, 17, 23];
  const C_GREEN = [16,185,129];
  const C_RED   = [239,68, 68];
  const C_GRAY  = [100,116,139];
  const C_LIGHT = [248,250,252];

  doc.setFillColor(...C_DARK); doc.rect(0, 0, 210, 40, 'F');
  doc.setFillColor(...C_GREEN); doc.rect(0, 0, 4, 40, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(20); doc.setFont('helvetica','bold'); doc.text('ClinicFinance', 12, 16);
  doc.setFontSize(11); doc.setFont('helvetica','normal'); doc.text(`Relatório ${label}`, 12, 24);
  doc.setFontSize(9); doc.setTextColor(148,163,184);
  doc.text(`Período: ${periodStr}`, 12, 31);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}`, 110, 31);

  let y = 50;
  doc.setTextColor(...C_DARK); doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text('Resumo do Período', 12, y); y += 6;

  doc.autoTable({
    startY: y,
    head: [['Indicador','Valor']],
    body: [
      ['Receita Total', fCurrency(revenue)],
      ['Despesas — Saídas', fCurrency(expSaidasPdf)],
      ['Despesas — Consultório', fCurrency(expClinicPdf)],
      ['Despesas — Produtos & Insumos', fCurrency(expProdsPdf)],
      ['Despesas Totais', fCurrency(expenses)],
      ['Lucro Líquido', fCurrency(profit)],
      ['Margem de Lucro', margin + '%'],
      ['Procedimentos', String(fe.length)],
    ],
    theme:'grid', styles:{ fontSize:10, cellPadding:4 },
    headStyles:{ fillColor:C_DARK, textColor:[255,255,255], fontStyle:'bold' },
    columnStyles:{ 1:{ halign:'right', fontStyle:'bold' } },
    margin:{ left:12, right:12 }, tableWidth:90,
  });
  y = doc.lastAutoTable.finalY + 12;

  if (fe.length) {
    if (y > 210) { doc.addPage(); y = 15; }
    doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(...C_DARK);
    doc.text('Entradas', 12, y); y += 4;
    doc.autoTable({
      startY: y,
      head: [['Data','Cliente','Procedimento','Pagamento','Valor']],
      body: fe.slice().sort((a,b) => b.date.localeCompare(a.date)).map(x => [fDate(x.date), x.clientName||'—', PROCEDURES[x.procedure]||x.procedure, PAYMENT_METHODS[x.payment]||x.payment, fCurrency(x.value)]),
      foot: [['','','','Total', fCurrency(revenue)]],
      theme:'striped', styles:{ fontSize:9, cellPadding:3 },
      headStyles:{ fillColor:C_GREEN, textColor:[255,255,255] },
      footStyles:{ fillColor:C_LIGHT, textColor:C_DARK, fontStyle:'bold' },
      columnStyles:{ 4:{ halign:'right' } }, margin:{ left:12, right:12 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  const allExits = [...fx.map(x => ({ ...x, cat: EXIT_CATEGORIES[x.category]||x.category })), ...fc.map(x => ({ ...x, cat: CLINIC_CATEGORIES[x.category]||x.category }))];
  if (allExits.length) {
    if (y > 210) { doc.addPage(); y = 15; }
    doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(...C_DARK);
    doc.text('Saídas & Consultório', 12, y); y += 4;
    doc.autoTable({
      startY: y,
      head: [['Data','Categoria','Descrição','Valor']],
      body: allExits.slice().sort((a,b) => b.date.localeCompare(a.date)).map(x => [fDate(x.date), x.cat, x.description, fCurrency(x.value)]),
      foot: [['','','Total', fCurrency(expSaidasPdf + expClinicPdf)]],
      theme:'striped', styles:{ fontSize:9, cellPadding:3 },
      headStyles:{ fillColor:C_RED, textColor:[255,255,255] },
      footStyles:{ fillColor:C_LIGHT, textColor:C_DARK, fontStyle:'bold' },
      columnStyles:{ 3:{ halign:'right' } }, margin:{ left:12, right:12 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  if (products.length) {
    if (y > 210) { doc.addPage(); y = 15; }
    doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(...C_DARK);
    doc.text('Produtos & Insumos', 12, y); y += 4;
    doc.autoTable({
      startY: y,
      head: [['Produto','Categoria','Qtd','Custo Unit.','Custo Total']],
      body: products.map(p => [p.name, PRODUCT_CATEGORIES[p.category]||p.category, String(p.qty), fCurrency(p.unitCost), fCurrency(p.totalCost)]),
      foot: [['','','','Total', fCurrency(expProdsPdf)]],
      theme:'striped', styles:{ fontSize:9, cellPadding:3 },
      headStyles:{ fillColor:[139,92,246], textColor:[255,255,255] },
      footStyles:{ fillColor:C_LIGHT, textColor:C_DARK, fontStyle:'bold' },
      columnStyles:{ 2:{ halign:'center' }, 3:{ halign:'right' }, 4:{ halign:'right' } }, margin:{ left:12, right:12 },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  if (y > 240) { doc.addPage(); y = 15; }
  doc.autoTable({
    startY: y,
    body: [['Receita Total', fCurrency(revenue)], ['(-) Despesas', fCurrency(expenses)], ['(=) Lucro Líquido', fCurrency(profit)], ['Margem de Lucro', margin + '%']],
    theme:'grid', styles:{ fontSize:10, cellPadding:4 }, bodyStyles:{ fontStyle:'bold' },
    columnStyles:{ 0:{ fillColor:C_LIGHT }, 1:{ halign:'right', textColor: profit>=0 ? C_GREEN : C_RED } },
    margin:{ left:12, right:12 }, tableWidth:100,
  });

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(...C_GRAY);
    doc.text('ClinicFinance — Relatório Financeiro Confidencial', 12, 290);
    doc.text(`Página ${i} / ${pages}`, 190, 290, { align:'right' });
  }

  doc.save(`clinicfinance-relatorio-${label.toLowerCase()}-${today()}.pdf`);
  toast(`PDF do relatório ${label} gerado!`, 'success');
}

/* ===== THEME ===== */
/* Tema claro único (paleta warm earth). O dark mode foi removido. */
function initTheme() {
  document.documentElement.setAttribute('data-theme', 'light');
  const btn = document.querySelector('.topbar-icon-btn[onclick="toggleTheme()"]');
  if (btn) btn.style.display = 'none';
}
function toggleTheme() { /* desativado — tema claro único */ }
function updateTopbarAvatar() {
  const el = document.getElementById('topbarAvatar');
  if (!el) return;
  const avatar   = currentProfile.avatar_data || '';
  const firstName = currentProfile.first_name || '';
  const lastName  = currentProfile.last_name  || '';
  const initials  = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase() || '?';
  if (avatar) {
    el.innerHTML = `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:8px" alt="avatar" />`;
  } else {
    el.textContent = initials;
  }
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebarState();
  document.getElementById('dateBadge').textContent =
    new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Configura nav listeners UMA VEZ antes do onAuthStateChange
  let navListenersAttached = false;
  function attachNavListeners() {
    if (navListenersAttached) return;
    navListenersAttached = true;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', ev => { ev.preventDefault(); navigateTo(el.dataset.view); });
    });
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
  }

  // Escuta mudanças de autenticação (login, logout, refresh de sessão)
  // IMPORTANTE: este evento pode disparar várias vezes (INITIAL_SESSION, TOKEN_REFRESHED…).
  // O AbortController cancela a carga anterior para liberar as conexões HTTP antes de iniciar a nova.
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      // Cancela qualquer loadAllData() em andamento para liberar conexões do pool
      if (_loadController) _loadController.abort();
      _loadController = new AbortController();
      const signal = _loadController.signal;

      currentUser  = session.user;
      _accessToken = session.access_token; // salva token para db()

      // Mostra o app e configura navegação apenas na primeira vez
      if (!_appShown) {
        _appShown = true;
        attachNavListeners();
        showApp();
        navigateTo('dashboard');
      }

      await loadAllData(signal);

      // Só renderiza se esta carga não foi cancelada
      if (!signal.aborted) {
        renderView(state.currentView);
        updateNotifBadge();
      }
    } else {
      if (_loadController) { _loadController.abort(); _loadController = null; }
      _appShown    = false;
      currentUser  = null;
      _accessToken = null;
      showAuth();
    }
  });
});

/* ============================================================
   CUSTOM DATE PICKER — ClinicFinance
   Substitui o calendário nativo do browser
   ============================================================ */
const CF_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CF_WDAYS  = ['D','S','T','Q','Q','S','S'];
let _cfActivePickerId = null;

function cfDatePicker(inputId, opts = {}) {
  const el = document.getElementById(inputId);
  if (!el || el.dataset.cfInit) return;
  el.dataset.cfInit = '1';

  // Wrap original input
  const wrap = document.createElement('div');
  wrap.className = 'cf-datepicker-wrap' + (opts.small ? ' small' : '');

  const display = document.createElement('input');
  display.type = 'text';
  display.readOnly = true;
  display.className = 'cf-datepicker-input';
  display.placeholder = opts.placeholder || 'Selecione a data';
  display.id = inputId + '_display';

  // Hidden input mantém o valor real (yyyy-mm-dd)
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = el.name;
  hidden.id = inputId;
  hidden.value = el.value || '';
  if (el.required) hidden.required = true;

  // Icon
  const icon = document.createElement('div');
  icon.className = 'cf-datepicker-icon';
  icon.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

  // Calendar popup
  const cal = document.createElement('div');
  cal.className = 'cf-cal';
  cal.id = inputId + '_cal';

  // Replace original
  el.parentNode.insertBefore(wrap, el);
  el.remove();
  wrap.appendChild(display);
  wrap.appendChild(hidden);
  wrap.appendChild(icon);
  wrap.appendChild(cal);

  // State
  let curYear, curMonth;
  const selDate = hidden.value ? new Date(hidden.value + 'T12:00:00') : null;
  if (selDate && !isNaN(selDate)) {
    curYear = selDate.getFullYear();
    curMonth = selDate.getMonth();
    display.value = selDate.toLocaleDateString('pt-BR');
  } else {
    const now = new Date();
    curYear = now.getFullYear();
    curMonth = now.getMonth();
  }

  function render() {
    const todayStr = today();
    const first = new Date(curYear, curMonth, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
    const prevDays = new Date(curYear, curMonth, 0).getDate();

    let html = `<div class="cf-cal-header">
      <span class="cf-cal-title">${CF_MONTHS[curMonth]} ${curYear}</span>
      <div class="cf-cal-nav">
        <button type="button" onclick="cfCalNav('${inputId}', -1)"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
        <button type="button" onclick="cfCalNav('${inputId}', 1)"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
      </div>
    </div>`;
    html += '<div class="cf-cal-days">';
    CF_WDAYS.forEach(w => { html += `<span class="cf-cal-wday">${w}</span>`; });

    // Previous month trailing days
    for (let i = startDay - 1; i >= 0; i--) {
      const d = prevDays - i;
      html += `<button type="button" class="cf-cal-day other" onclick="cfCalPick('${inputId}', ${curYear}, ${curMonth - 1}, ${d})">${d}</button>`;
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${curYear}-${String(curMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isToday = dateStr === todayStr;
      const isSel = dateStr === hidden.value;
      let cls = 'cf-cal-day';
      if (isToday) cls += ' today';
      if (isSel) cls += ' selected';
      html += `<button type="button" class="${cls}" onclick="cfCalPick('${inputId}', ${curYear}, ${curMonth}, ${d})">${d}</button>`;
    }
    // Next month trailing days
    const totalCells = startDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
      html += `<button type="button" class="cf-cal-day other" onclick="cfCalPick('${inputId}', ${curYear}, ${curMonth + 1}, ${d})">${d}</button>`;
    }
    html += '</div>';
    html += `<div class="cf-cal-footer">
      <button type="button" class="cf-cal-clear" onclick="cfCalClear('${inputId}')">Limpar</button>
      <button type="button" class="cf-cal-today" onclick="cfCalToday('${inputId}')">Hoje</button>
    </div>`;
    cal.innerHTML = html;
  }

  // Store state on wrap for navigation
  wrap._cfState = { render, getMonth: () => curMonth, getYear: () => curYear, setMonth: m => { curMonth = m; }, setYear: y => { curYear = y; } };

  // Toggle on click
  display.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const isOpen = cal.classList.contains('open');
    cfCloseAll();
    if (!isOpen) {
      // Position: check if overflows right
      const rect = wrap.getBoundingClientRect();
      if (rect.left + 290 > window.innerWidth) cal.classList.add('right');
      else cal.classList.remove('right');
      render();
      cal.classList.add('open');
      display.classList.add('active');
      _cfActivePickerId = inputId;
    }
  });

  cal.addEventListener('click', ev => ev.stopPropagation());
  render();
}

function cfCalNav(id, dir) {
  const wrap = document.getElementById(id)?.closest('.cf-datepicker-wrap') ||
               document.getElementById(id + '_display')?.closest('.cf-datepicker-wrap');
  if (!wrap?._cfState) return;
  let m = wrap._cfState.getMonth() + dir;
  let y = wrap._cfState.getYear();
  if (m > 11) { m = 0; y++; }
  if (m < 0) { m = 11; y--; }
  wrap._cfState.setMonth(m);
  wrap._cfState.setYear(y);
  wrap._cfState.render();
}

function cfCalPick(id, y, m, d) {
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const hidden = document.getElementById(id);
  const display = document.getElementById(id + '_display');
  if (hidden) {
    hidden.value = dateStr;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (display) {
    display.value = new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
  }
  cfCloseAll();
}

function cfCalToday(id) {
  const now = new Date();
  cfCalPick(id, now.getFullYear(), now.getMonth(), now.getDate());
}

function cfCalClear(id) {
  const hidden = document.getElementById(id);
  const display = document.getElementById(id + '_display');
  if (hidden) { hidden.value = ''; hidden.dispatchEvent(new Event('change', { bubbles: true })); }
  if (display) display.value = '';
  cfCloseAll();
}

function cfCloseAll() {
  document.querySelectorAll('.cf-cal.open').forEach(c => c.classList.remove('open'));
  document.querySelectorAll('.cf-datepicker-input.active').forEach(i => i.classList.remove('active'));
  _cfActivePickerId = null;
}

// Fecha ao clicar fora
document.addEventListener('click', () => cfCloseAll());

// Inicializa datepickers após cada render
function initDatePickers() {
  document.querySelectorAll('input[type="date"]').forEach(el => {
    if (!el.id) el.id = 'cf_date_' + Math.random().toString(36).slice(2, 8);
    const isSmall = el.classList.contains('filter-input');
    cfDatePicker(el.id, { small: isSmall });
  });
}
