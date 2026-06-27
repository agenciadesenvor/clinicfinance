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
  return { year: d.getFullYear(), month: d.getMonth(), appts: [], patients: [] };
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
        <button class="btn btn-ghost btn-icon" onclick="agShift(-1)" aria-label="Mês anterior">${svg('<polyline points="15 18 9 12 15 6"/>')}</button>
        <span class="ag-month" id="agMonthLabel"></span>
        <button class="btn btn-ghost btn-icon" onclick="agShift(1)" aria-label="Próximo mês">${svg('<polyline points="9 18 15 12 9 6"/>')}</button>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="agToday()">Hoje</button>
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
  renderCalendar();
  renderUpcoming();
}

/* ===== Navegação de mês ===== */
function agShift(delta) {
  _agenda.month += delta;
  if (_agenda.month < 0) { _agenda.month = 11; _agenda.year--; }
  if (_agenda.month > 11) { _agenda.month = 0; _agenda.year++; }
  renderCalendar();
}
function agToday() {
  const d = new Date();
  _agenda.year = d.getFullYear(); _agenda.month = d.getMonth();
  renderCalendar();
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

function agGisReady() { return !!(window.google && google.accounts && google.accounts.oauth2); }
function agGoogleConnected() { return !!_gToken && Date.now() < _gExpiry; }

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
        try { localStorage.setItem('cf_google_connected', '1'); } catch (e) {}
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

/* reconecta silenciosamente se já houve conexão antes (sem janela) */
function agTrySilentGoogle() {
  let was = false;
  try { was = localStorage.getItem('cf_google_connected') === '1'; } catch (e) {}
  if (was && agGisReady() && !agGoogleConnected()) agRequestToken(false);
}

function agUpdateGoogleBtn(connected) {
  const btn = document.getElementById('agGoogleBtn');
  if (!btn) return;
  btn.innerHTML = connected
    ? `${iconCheck()} Google conectado`
    : `${iconGoogle()} Conectar Google Agenda`;
  btn.classList.toggle('ag-google-on', !!connected);
}

/* chamada à Calendar API */
async function agGoogleApi(method, path, body) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${_gToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
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
