/* ============================================================
   ClinicFinance — agenda.js  (Fase 2.1)
   Agenda de consultas: calendário mensal + agendamentos.
   Ligado ao CRM (crm_pacientes). Tabela: agendamentos (ver agenda.sql)
   Espaço reservado p/ sincronização Google Calendar (Fase 2.2).
   ============================================================ */

/* ===== Config Google (Fase 2.2 — modo simples, client-side GIS) ===== */
const GOOGLE_CLIENT_ID = '817797757882-d2etve0lotihkifudqjq932mk7f7mksv.apps.googleusercontent.com';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_TZ = 'America/Recife';

/* ===== Constantes ===== */
const AG_STATUS = {
  agendado:   { label: 'Agendado',   badge: 'badge-blue'  },
  confirmado: { label: 'Confirmado', badge: 'badge-green' },
  realizado:  { label: 'Realizado',  badge: 'badge-gray'  },
  cancelado:  { label: 'Cancelado',  badge: 'badge-red'   }
};
const AG_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const AG_MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/* ===== Store ===== */
const _agenda = (() => {
  const d = new Date();
  const ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { year: d.getFullYear(), month: d.getMonth(), mode: 'mes', ref, appts: [], patients: [] };
})();

/* ===== Helpers ===== */
const agPad = n => String(n).padStart(2, '0');
const agDateStr = (y, m, d) => `${y}-${agPad(m + 1)}-${agPad(d)}`;
const agHora = t => (t ? t.slice(0, 5) : '');

const mapAgendamento = r => ({
  id: r.id, pacienteId: r.paciente_id || '', pacienteNome: r.paciente_nome || '',
  procedimento: r.procedimento || '', data: r.data, horaInicio: r.hora_inicio || '', horaFim: r.hora_fim || '',
  status: r.status || 'agendado', observacoes: r.observacoes || '', googleEventId: r.google_event_id || ''
});

/* ===== View principal ===== */
function renderAgenda() {
  setTimeout(() => { loadAgenda(); agTrySilentGoogle(); agUpdateGoogleBtn(agGoogleConnected()); }, 0);
  const connected = agGoogleConnected();
  return `
  <div class="section-header">
    <div><div class="section-title">Agenda</div><div class="section-sub">Consultas e compromissos da clínica</div></div>
    <div class="doc-actions">
      <button class="btn btn-secondary${connected ? ' ag-google-on' : ''}" id="agGoogleBtn" onclick="agConnectGoogle()" title="Sincronizar com Google Calendar">${connected ? `${iconCheck()} Google conectado` : `${iconGoogle()} Conectar Google Agenda`}</button>
      <button class="btn btn-primary" onclick="openAgendaModal()">${iconPlus()} Novo Agendamento</button>
    </div>
  </div>

  <div class="ag-banner" id="agBanner">
    ${iconInfo()} <span>Conecte o Google Agenda para que os agendamentos criados aqui apareçam automaticamente no Google Calendar da clínica.</span>
  </div>

  <div class="card ag-card">
    <div class="ag-toolbar">
      <div class="ag-nav">
        <button class="btn btn-ghost btn-icon" onclick="agShift(-1)" aria-label="Anterior">${svg('<polyline points="15 18 9 12 15 6"/>')}</button>
        <span class="ag-month" id="agMonthLabel"></span>
        <button class="btn btn-ghost btn-icon" onclick="agShift(1)" aria-label="Próximo">${svg('<polyline points="9 18 15 12 9 6"/>')}</button>
      </div>
      <div class="ag-modes">
        <div class="ag-seg">
          <button class="ag-mode-btn" data-mode="mes" onclick="agSetMode('mes')">Mês</button>
          <button class="ag-mode-btn" data-mode="semana" onclick="agSetMode('semana')">Semana</button>
          <button class="ag-mode-btn" data-mode="dia" onclick="agSetMode('dia')">Dia</button>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="agToday()">Hoje</button>
      </div>
    </div>
    <div id="agCalendar"><div class="doc-list-empty">Carregando…</div></div>
  </div>

  <div class="card ag-card" style="margin-top:20px">
    <div class="doc-block-title">Próximos agendamentos</div>
    <div id="agUpcoming"><div class="doc-list-empty">Carregando…</div></div>
  </div>`;
}

/* ===== Carga ===== */
async function loadAgenda() {
  if (typeof currentUser === 'undefined' || !currentUser) {
    const c = document.getElementById('agCalendar');
    if (c) c.innerHTML = `<div class="doc-list-empty">Faça login para ver a agenda.</div>`;
    return;
  }
  const first = agDateStr(_agenda.year, _agenda.month, 1);
  const lastDay = new Date(_agenda.year, _agenda.month + 1, 0).getDate();
  const last = agDateStr(_agenda.year, _agenda.month, lastDay);

  const [ag, pac] = await Promise.all([
    db('agendamentos').select('*').eq('user_id', currentUser.id).order('data'),
    db('crm_pacientes').select('id,nome').eq('user_id', currentUser.id).order('nome')
  ]);
  if (ag.error) {
    const c = document.getElementById('agCalendar');
    if (c) c.innerHTML = `<div class="doc-list-empty">Erro ao carregar. Verifique se a tabela da agenda foi criada (agenda.sql).</div>`;
    return;
  }
  _agenda.appts = (ag.data || []).map(mapAgendamento);
  _agenda.patients = pac.data || [];
  agRenderBody();
  renderUpcoming();
}

/* ===== Navegação / modos ===== */
function agRefDate() { const [y, m, d] = _agenda.ref.split('-').map(Number); return new Date(y, m - 1, d); }
function agSetRef(dt) { _agenda.ref = agDateStr(dt.getFullYear(), dt.getMonth(), dt.getDate()); _agenda.year = dt.getFullYear(); _agenda.month = dt.getMonth(); }

function agSetMode(mode) {
  _agenda.mode = mode;
  agRenderBody();
}

function agShift(delta) {
  if (_agenda.mode === 'mes') {
    _agenda.month += delta;
    if (_agenda.month < 0) { _agenda.month = 11; _agenda.year--; }
    if (_agenda.month > 11) { _agenda.month = 0; _agenda.year++; }
    _agenda.ref = agDateStr(_agenda.year, _agenda.month, 1);
  } else {
    const dt = agRefDate();
    dt.setDate(dt.getDate() + (_agenda.mode === 'semana' ? 7 * delta : delta));
    agSetRef(dt);
  }
  agRenderBody();
}

function agToday() {
  const d = new Date();
  agSetRef(d);
  agRenderBody();
}

/* dispatcher: escolhe a visão conforme o modo */
function agRenderBody() {
  document.querySelectorAll('.ag-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === _agenda.mode));
  if (_agenda.mode === 'semana') renderWeek();
  else if (_agenda.mode === 'dia') renderDay();
  else renderCalendar();
}

function agByDay() {
  const m = {};
  _agenda.appts.forEach(a => { (m[a.data] = m[a.data] || []).push(a); });
  Object.values(m).forEach(arr => arr.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || '')));
  return m;
}

/* início da semana (domingo) que contém o ref */
function agWeekStart() {
  const dt = agRefDate();
  dt.setDate(dt.getDate() - dt.getDay());
  return dt;
}

/* ===== Visão Semana ===== */
function renderWeek() {
  const el = document.getElementById('agCalendar');
  const label = document.getElementById('agMonthLabel');
  if (!el) return;
  const start = agWeekStart();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const last = days[6];
  if (label) label.textContent = start.getMonth() === last.getMonth()
    ? `${start.getDate()}–${last.getDate()} de ${AG_MONTHS[start.getMonth()].toLowerCase()} ${start.getFullYear()}`
    : `${start.getDate()} ${AG_MONTHS[start.getMonth()].slice(0,3).toLowerCase()} – ${last.getDate()} ${AG_MONTHS[last.getMonth()].slice(0,3).toLowerCase()} ${last.getFullYear()}`;

  const byDay = agByDay();
  const todayStr = today();
  el.innerHTML = `<div class="ag-week">${days.map(d => {
    const ds = agDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    const items = byDay[ds] || [];
    return `<div class="ag-week-col${ds === todayStr ? ' ag-today' : ''}">
      <div class="ag-week-head" onclick="openAgendaModal(null,'${ds}')">
        <span class="ag-week-wd">${AG_WEEKDAYS[d.getDay()]}</span>
        <span class="ag-week-num">${d.getDate()}</span>
      </div>
      <div class="ag-week-body">
        ${items.length ? items.map(a => agEventChip(a)).join('') : '<div class="ag-week-empty">—</div>'}
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* ===== Visão Dia ===== */
function renderDay() {
  const el = document.getElementById('agCalendar');
  const label = document.getElementById('agMonthLabel');
  if (!el) return;
  const d = agRefDate();
  const ds = agDateStr(d.getFullYear(), d.getMonth(), d.getDate());
  if (label) label.textContent = `${AG_WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${AG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const items = (agByDay()[ds] || []);
  el.innerHTML = `<div class="ag-day">
    ${items.length
      ? items.map(a => agEventRow(a)).join('')
      : `<div class="empty-state" style="padding:32px 0">${iconCalendar()}<h3>Nada agendado</h3><p>Clique em "Novo Agendamento" para marcar uma consulta neste dia.</p></div>`}
    <button class="ag-day-add" onclick="openAgendaModal(null,'${ds}')">${iconPlus()} Agendar neste dia</button>
  </div>`;
}

/* chip de evento (visão semana) */
function agEventChip(a) {
  const st = AG_STATUS[a.status] || AG_STATUS.agendado;
  return `<button class="ag-ev ${st.badge}" onclick="openAgendaModal('${a.id}')" title="${esc(a.pacienteNome)}${a.procedimento ? ' — ' + esc(a.procedimento) : ''}">
    ${a.horaInicio ? `<span class="ag-ev-time">${agHora(a.horaInicio)}</span>` : ''}${esc(a.pacienteNome)}</button>`;
}

/* linha de evento (visão dia) */
function agEventRow(a) {
  const st = AG_STATUS[a.status] || AG_STATUS.agendado;
  return `<div class="ag-day-row" onclick="openAgendaModal('${a.id}')">
    <div class="ag-day-time">${a.horaInicio ? agHora(a.horaInicio) : '—'}${a.horaFim ? `<span>${agHora(a.horaFim)}</span>` : ''}</div>
    <div class="ag-day-bar ${st.badge}"></div>
    <div class="ag-day-info">
      <span class="ag-up-name">${esc(a.pacienteNome)}</span>
      ${a.procedimento ? `<span class="ag-up-proc">${esc(a.procedimento)}</span>` : ''}
    </div>
    <span class="badge ${st.badge}">${st.label}</span>
  </div>`;
}

/* ===== Calendário ===== */
function renderCalendar() {
  const el = document.getElementById('agCalendar');
  const label = document.getElementById('agMonthLabel');
  if (label) label.textContent = `${AG_MONTHS[_agenda.month]} ${_agenda.year}`;
  if (!el) return;

  const todayStr = today();
  const firstWeekday = new Date(_agenda.year, _agenda.month, 1).getDay();
  const daysInMonth = new Date(_agenda.year, _agenda.month + 1, 0).getDate();

  const byDay = {};
  _agenda.appts.forEach(a => { (byDay[a.data] = byDay[a.data] || []).push(a); });

  let cells = '';
  cells += AG_WEEKDAYS.map(w => `<div class="ag-wd">${w}</div>`).join('');
  for (let i = 0; i < firstWeekday; i++) cells += `<div class="ag-cell ag-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = agDateStr(_agenda.year, _agenda.month, d);
    const items = (byDay[ds] || []).sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
    const isToday = ds === todayStr;
    const shown = items.slice(0, 3);
    const extra = items.length - shown.length;
    cells += `<div class="ag-cell${isToday ? ' ag-today' : ''}" onclick="openAgendaModal(null,'${ds}')">
      <div class="ag-daynum">${d}</div>
      <div class="ag-events">
        ${shown.map(a => {
          const st = AG_STATUS[a.status] || AG_STATUS.agendado;
          return `<button class="ag-ev ${st.badge}" onclick="event.stopPropagation();openAgendaModal('${a.id}')" title="${esc(a.pacienteNome)}${a.procedimento ? ' — ' + esc(a.procedimento) : ''}">
            ${a.horaInicio ? `<span class="ag-ev-time">${agHora(a.horaInicio)}</span>` : ''}${esc(a.pacienteNome)}</button>`;
        }).join('')}
        ${extra > 0 ? `<span class="ag-more">+${extra}</span>` : ''}
      </div>
    </div>`;
  }
  el.innerHTML = `<div class="ag-grid">${cells}</div>`;
}

/* ===== Próximos agendamentos ===== */
function renderUpcoming() {
  const el = document.getElementById('agUpcoming');
  if (!el) return;
  const todayStr = today();
  const items = _agenda.appts
    .filter(a => a.data >= todayStr && a.status !== 'cancelado')
    .sort((a, b) => (a.data + (a.horaInicio || '')).localeCompare(b.data + (b.horaInicio || '')))
    .slice(0, 8);
  if (!items.length) { el.innerHTML = `<div class="doc-list-empty">Nenhum agendamento futuro.</div>`; return; }
  el.innerHTML = items.map(a => {
    const st = AG_STATUS[a.status] || AG_STATUS.agendado;
    return `<div class="ag-up-item" onclick="openAgendaModal('${a.id}')">
      <div class="ag-up-date"><span class="ag-up-day">${fDateShort(a.data)}</span>${a.horaInicio ? `<span class="ag-up-time">${agHora(a.horaInicio)}</span>` : ''}</div>
      <div class="ag-up-info"><span class="ag-up-name">${esc(a.pacienteNome)}</span>${a.procedimento ? `<span class="ag-up-proc">${esc(a.procedimento)}</span>` : ''}</div>
      <span class="badge ${st.badge}">${st.label}</span>
    </div>`;
  }).join('');
}

/* ===== Modal Novo / Editar ===== */
function openAgendaModal(id = null, presetDate = null) {
  const a = id ? _agenda.appts.find(x => x.id === id) : null;
  const patOptions = _agenda.patients.map(p => `<option value="${p.id}" ${a?.pacienteId === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('');
  const statusOptions = Object.entries(AG_STATUS).map(([k, v]) => `<option value="${k}" ${a?.status === k ? 'selected' : ''}>${v.label}</option>`).join('');

  openModal(id ? 'Editar Agendamento' : 'Novo Agendamento', `
    <form onsubmit="saveAgendamento(event)">
      <input type="hidden" id="agId" value="${a?.id || ''}" />
      <div class="form-grid">
        <div class="form-group form-full">
          <label class="form-label" for="agPacienteSel">Paciente (do CRM)</label>
          <select class="form-control" id="agPacienteSel" onchange="agFillPaciente()">
            <option value="">— Selecionar ou digitar abaixo —</option>
            ${patOptions}
          </select>
        </div>
        <div class="form-group form-full">
          <label class="form-label" for="agPacienteNome">Nome do paciente *</label>
          <input type="text" class="form-control" id="agPacienteNome" value="${esc(a?.pacienteNome || '')}" placeholder="Nome do paciente" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="agData">Data *</label>
          <input type="date" class="form-control" id="agData" value="${a?.data || presetDate || today()}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="agStatus">Status</label>
          <select class="form-control" id="agStatus">${statusOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="agHoraInicio">Início</label>
          <input type="time" class="form-control" id="agHoraInicio" value="${agHora(a?.horaInicio) || '09:00'}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="agHoraFim">Fim</label>
          <input type="time" class="form-control" id="agHoraFim" value="${agHora(a?.horaFim) || '10:00'}" />
        </div>
        <div class="form-group form-full">
          <label class="form-label" for="agProcedimento">Procedimento</label>
          <input type="text" class="form-control" id="agProcedimento" value="${esc(a?.procedimento || '')}" placeholder="Ex.: Botox, avaliação…" />
        </div>
        <div class="form-group form-full">
          <label class="form-label" for="agObs">Observações</label>
          <textarea class="form-control" id="agObs" rows="2" placeholder="Anotações do agendamento…">${esc(a?.observacoes || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        ${id ? `<button type="button" class="btn btn-danger" style="margin-right:auto" onclick="deleteAgendamento('${a.id}')">${iconTrash()} Excluir</button>` : ''}
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">${iconCheck()} ${id ? 'Salvar' : 'Agendar'}</button>
      </div>
    </form>`, true);
}

function agFillPaciente() {
  const sel = document.getElementById('agPacienteSel');
  const nome = document.getElementById('agPacienteNome');
  if (sel.value) {
    const p = _agenda.patients.find(x => x.id === sel.value);
    if (p && nome) nome.value = p.nome;
  }
}

async function saveAgendamento(ev) {
  ev.preventDefault();
  if (!currentUser) { toast('Faça login para salvar.', 'error'); return; }
  const id = document.getElementById('agId').value || null;
  const nome = document.getElementById('agPacienteNome').value.trim();
  if (!nome) { toast('Informe o nome do paciente.', 'error'); return; }
  const selId = document.getElementById('agPacienteSel').value || null;
  const existing = id ? _agenda.appts.find(x => x.id === id) : null;
  const data = document.getElementById('agData').value;
  const horaInicio = document.getElementById('agHoraInicio').value || null;
  const horaFim = document.getElementById('agHoraFim').value || null;
  const procedimento = document.getElementById('agProcedimento').value.trim() || null;
  const observacoes = document.getElementById('agObs').value.trim() || null;
  const status = document.getElementById('agStatus').value;

  // Aviso de conflito de horário (mesma data, horários sobrepostos)
  if (horaInicio && horaFim && status !== 'cancelado') {
    const conflito = _agenda.appts.find(x => x.id !== id && x.data === data && x.status !== 'cancelado'
      && x.horaInicio && x.horaFim && horaInicio < x.horaFim && x.horaInicio < horaFim);
    if (conflito && !confirm(`⚠️ Conflito de horário com "${conflito.pacienteNome}" (${agHora(conflito.horaInicio)}–${agHora(conflito.horaFim)}) no mesmo dia.\n\nDeseja agendar mesmo assim?`)) return;
  }

  const payload = {
    paciente_id: selId, paciente_nome: nome, procedimento, data,
    hora_inicio: horaInicio, hora_fim: horaFim, status, observacoes,
    updated_at: new Date().toISOString()
  };
  const recId = id || uid();
  let error;
  if (id) ({ error } = await db('agendamentos').update(payload).eq('id', id));
  else    ({ error } = await db('agendamentos').insert({ id: recId, user_id: currentUser.id, ...payload }));
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }

  // Sincroniza com o Google Calendar (se conectado nesta sessão)
  if (agGoogleConnected()) {
    const appt = { id: recId, pacienteNome: nome, procedimento, data, horaInicio, horaFim, observacoes, googleEventId: existing?.googleEventId || '' };
    const evId = await agSyncEvent(appt);
    if (evId && evId !== (existing?.googleEventId || '')) {
      await db('agendamentos').update({ google_event_id: evId }).eq('id', recId);
    }
  }

  toast(id ? 'Agendamento atualizado!' : 'Agendamento criado!', 'success');
  closeModal();
  await loadAgenda();
}

async function deleteAgendamento(id) {
  if (!confirm('Excluir este agendamento?')) return;
  const appt = _agenda.appts.find(x => x.id === id);
  const { error } = await db('agendamentos').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  if (appt && appt.googleEventId) await agDeleteEvent(appt.googleEventId);
  toast('Agendamento excluído.', 'success');
  closeModal();
  await loadAgenda();
}

/* ===== Google Calendar (Fase 2.2 — modo simples, client-side) ===== */
let _gToken = null;          // access token em memória (dura ~1h)
let _gExpiry = 0;
let _gTokenClient = null;
let _gTokenResolve = null;
const GIS_TOKEN_KEY = 'cf_google_token';

function agGisReady() { return !!(window.google && google.accounts && google.accounts.oauth2); }
function agGoogleConnected() { return !!_gToken && Date.now() < _gExpiry; }

/* persiste/restaura o token para sobreviver a reloads dentro da validade (~1h) */
function agSaveToken() {
  try { localStorage.setItem(GIS_TOKEN_KEY, JSON.stringify({ t: _gToken, e: _gExpiry })); localStorage.setItem('cf_google_connected', '1'); } catch (e) {}
}
function agRestoreToken() {
  try {
    const o = JSON.parse(localStorage.getItem(GIS_TOKEN_KEY) || 'null');
    if (o && o.t && o.e && Date.now() < o.e) { _gToken = o.t; _gExpiry = o.e; return true; }
  } catch (e) {}
  return false;
}
function agClearToken() {
  _gToken = null; _gExpiry = 0;
  try { localStorage.removeItem(GIS_TOKEN_KEY); localStorage.removeItem('cf_google_connected'); } catch (e) {}
  agUpdateGoogleBtn(false);
}

function agInitTokenClient() {
  if (_gTokenClient) return _gTokenClient;
  if (!agGisReady()) return null;
  _gTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPE,
    callback: (resp) => {
      if (resp && resp.access_token) {
        _gToken = resp.access_token;
        _gExpiry = Date.now() + ((resp.expires_in || 3600) * 1000) - 60000;
        agSaveToken();
        agUpdateGoogleBtn(true);
        if (_gTokenResolve) { _gTokenResolve(_gToken); _gTokenResolve = null; }
      } else if (_gTokenResolve) { _gTokenResolve(null); _gTokenResolve = null; }
    }
  });
  return _gTokenClient;
}

/* pede um token; interactive=true mostra a janela de consentimento */
function agRequestToken(interactive) {
  return new Promise((resolve) => {
    const c = agInitTokenClient();
    if (!c) { resolve(null); return; }
    _gTokenResolve = resolve;
    try { c.requestAccessToken({ prompt: interactive ? 'consent' : '' }); }
    catch (e) { _gTokenResolve = null; resolve(null); }
  });
}

/* botão "Conectar Google Agenda" */
async function agConnectGoogle() {
  if (!agGisReady()) { toast('Google ainda carregando… tente novamente em instantes.', 'error'); return; }
  const tok = await agRequestToken(true);
  if (tok) toast('Google Agenda conectado! Os agendamentos serão sincronizados.', 'success');
  else toast('Não foi possível conectar ao Google.', 'error');
}

/* espera o GIS (script async) carregar e então executa cb */
function agWaitForGis(cb, tries) {
  tries = (tries == null) ? 50 : tries;          // ~5s
  if (agGisReady()) { cb(); return; }
  if (tries <= 0) return;
  setTimeout(() => agWaitForGis(cb, tries - 1), 100);
}

/* reconecta sozinho: 1) usa token salvo (sem chamar o Google); 2) pede token silencioso */
function agTrySilentGoogle() {
  if (agRestoreToken()) { agUpdateGoogleBtn(true); return; }
  let was = false;
  try { was = localStorage.getItem('cf_google_connected') === '1'; } catch (e) {}
  if (!was) return;
  agWaitForGis(() => { if (!agGoogleConnected()) agRequestToken(false); });
}

function agUpdateGoogleBtn(connected) {
  const btn = document.getElementById('agGoogleBtn');
  if (!btn) return;
  btn.innerHTML = connected
    ? `${iconCheck()} Google conectado`
    : `${iconGoogle()} Conectar Google Agenda`;
  btn.classList.toggle('ag-google-on', !!connected);
}

/* restaura o token salvo já no carregamento do script (estado correto antes de abrir a Agenda) */
agRestoreToken();

/* chamada à Calendar API */
async function agGoogleApi(method, path, body) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${_gToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 401) { agClearToken(); throw new Error('Google: sessão expirada — reconecte.'); }
  if (!r.ok) throw new Error('Google Calendar: ' + r.status);
  return method === 'DELETE' ? {} : r.json();
}

function agEventBody(a) {
  const ini = a.horaInicio || '09:00';
  const fim = a.horaFim || a.horaInicio || '10:00';
  return {
    summary: a.pacienteNome + (a.procedimento ? ' — ' + a.procedimento : ''),
    description: a.observacoes || '',
    start: { dateTime: `${a.data}T${ini}:00`, timeZone: GOOGLE_TZ },
    end:   { dateTime: `${a.data}T${fim}:00`, timeZone: GOOGLE_TZ }
  };
}

/* cria/atualiza o evento no Google e devolve o eventId (ou null) */
async function agSyncEvent(appt) {
  if (!agGoogleConnected()) return null;
  try {
    if (appt.googleEventId) {
      await agGoogleApi('PUT', `/calendars/primary/events/${appt.googleEventId}`, agEventBody(appt));
      return appt.googleEventId;
    }
    const ev = await agGoogleApi('POST', `/calendars/primary/events`, agEventBody(appt));
    return ev.id || null;
  } catch (e) {
    toast('Salvo no app, mas falhou ao sincronizar com o Google.', 'error');
    return null;
  }
}

async function agDeleteEvent(googleEventId) {
  if (!googleEventId || !agGoogleConnected()) return;
  try { await agGoogleApi('DELETE', `/calendars/primary/events/${googleEventId}`); } catch (e) {}
}

/* ===== Ícones ===== */
const iconGoogle = () => svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>');
const iconInfo   = () => svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', 'width="16" height="16"');
