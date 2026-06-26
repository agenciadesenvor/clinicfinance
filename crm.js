/* ============================================================
   ClinicFinance — crm.js  (Fase 1)
   CRM de atendimento: pacientes/leads, funil e linha do tempo.
   Tabelas: crm_pacientes, crm_interacoes (ver crm.sql)
   ============================================================ */

/* ===== Constantes ===== */
const CRM_STATUS = {
  novo:     { label: 'Novo lead',     badge: 'badge-blue'   },
  contato:  { label: 'Em contato',    badge: 'badge-gold'   },
  agendado: { label: 'Agendado',      badge: 'badge-purple' },
  cliente:  { label: 'Cliente ativo', badge: 'badge-green'  },
  retorno:  { label: 'Retorno',       badge: 'badge-teal'   },
  inativo:  { label: 'Inativo',       badge: 'badge-gray'   }
};
const CRM_ORIGEM = {
  instagram: 'Instagram', indicacao: 'Indicação', google: 'Google',
  whatsapp: 'WhatsApp', site: 'Site', facebook: 'Facebook', outro: 'Outro'
};
const CRM_TIPO = {
  nota: 'Anotação', ligacao: 'Ligação', whatsapp: 'WhatsApp',
  presencial: 'Presencial', agendamento: 'Agendamento', retorno: 'Retorno'
};

/* ===== Store local ===== */
const _crm = { pacientes: [], search: '', statusFilter: 'todos' };

/* ===== Mapper DB → JS ===== */
const mapPaciente = r => ({
  id: r.id, nome: r.nome, telefone: r.telefone || '', email: r.email || '',
  cpf: r.cpf || '', nascimento: r.nascimento || '', instagram: r.instagram || '',
  origem: r.origem || 'outro', status: r.status || 'novo', interesse: r.interesse || '',
  observacoes: r.observacoes || '', proximoContato: r.proximo_contato || '',
  createdAt: r.created_at, updatedAt: r.updated_at
});

/* ===== WhatsApp helper (link wa.me — útil já na Fase 1) ===== */
function crmWhatsLink(telefone) {
  const digits = (telefone || '').replace(/\D/g, '');
  if (!digits) return '';
  const full = digits.startsWith('55') ? digits : '55' + digits;
  return `https://wa.me/${full}`;
}

/* ===== View principal ===== */
function renderCrm() {
  setTimeout(() => loadCrm(), 0);
  return `
  <div class="section-header">
    <div><div class="section-title">CRM de Atendimento</div><div class="section-sub">Gerencie pacientes, leads e o funil de atendimento</div></div>
    <button class="btn btn-primary" onclick="openCrmModal()">${iconPlus()} Novo Paciente</button>
  </div>

  <div class="stats-grid" id="crmStats" style="margin-bottom:24px"></div>

  <div class="table-container">
    <div class="crm-filter-bar" id="crmFilterBar"></div>
    <div class="table-toolbar">
      <div class="table-search">${iconSearch()}
        <input type="text" id="crmSearch" placeholder="Buscar por nome, telefone ou interesse…" oninput="crmSetSearch(this.value)" autocomplete="off" spellcheck="false" />
      </div>
      <span style="font-size:13px;color:var(--text-2)" id="crmCount"></span>
    </div>
    <div id="crmTable"><div class="doc-list-empty">Carregando…</div></div>
  </div>`;
}

/* ===== Carga ===== */
async function loadCrm() {
  if (typeof currentUser === 'undefined' || !currentUser) {
    const t = document.getElementById('crmTable');
    if (t) t.innerHTML = `<div class="doc-list-empty">Faça login para ver os pacientes.</div>`;
    return;
  }
  const { data, error } = await db('crm_pacientes').select('*').eq('user_id', currentUser.id).order('updated_at', { ascending: false });
  const t = document.getElementById('crmTable');
  if (error) {
    if (t) t.innerHTML = `<div class="doc-list-empty">Erro ao carregar. Verifique se as tabelas do CRM foram criadas (crm.sql).</div>`;
    return;
  }
  _crm.pacientes = (data || []).map(mapPaciente);
  renderCrmStats();
  renderCrmFilters();
  renderCrmTable();
}

function crmFiltered() {
  const term = _crm.search.trim().toLowerCase();
  return _crm.pacientes.filter(p => {
    if (_crm.statusFilter !== 'todos' && p.status !== _crm.statusFilter) return false;
    if (!term) return true;
    return (p.nome + ' ' + p.telefone + ' ' + p.interesse).toLowerCase().includes(term);
  });
}

/* ===== Stats ===== */
function renderCrmStats() {
  const el = document.getElementById('crmStats');
  if (!el) return;
  const ps = _crm.pacientes;
  const count = s => ps.filter(p => p.status === s).length;
  el.innerHTML = [
    statCard('Total de Pacientes', String(ps.length),       'gold',  'Todos os cadastros',      iconUsers(), ''),
    statCard('Novos Leads',        String(count('novo')),   'blue',  'Aguardando primeiro contato', iconSpark(), ''),
    statCard('Agendados',          String(count('agendado')),'purple','Com consulta marcada',    iconCalendar(), ''),
    statCard('Clientes Ativos',    String(count('cliente')),'green', 'Em atendimento',          iconHeart(), '')
  ].join('');
}

/* ===== Filtros (chips por status) ===== */
function renderCrmFilters() {
  const el = document.getElementById('crmFilterBar');
  if (!el) return;
  const chips = [['todos', 'Todos', _crm.pacientes.length]];
  Object.entries(CRM_STATUS).forEach(([k, v]) => chips.push([k, v.label, _crm.pacientes.filter(p => p.status === k).length]));
  el.innerHTML = chips.map(([k, label, n]) =>
    `<button class="crm-chip${_crm.statusFilter === k ? ' active' : ''}" onclick="crmSetFilter('${k}')">${label} <span class="crm-chip-n">${n}</span></button>`
  ).join('');
}

function crmSetFilter(k) { _crm.statusFilter = k; renderCrmFilters(); renderCrmTable(); }
function crmSetSearch(v) { _crm.search = v || ''; renderCrmTable(); }

/* ===== Tabela ===== */
function renderCrmTable() {
  const el = document.getElementById('crmTable');
  if (!el) return;
  const items = crmFiltered();
  const countEl = document.getElementById('crmCount');
  if (countEl) countEl.textContent = `${items.length} paciente${items.length !== 1 ? 's' : ''}`;

  if (!items.length) {
    el.innerHTML = `<div class="empty-state">${iconEmptyBox()}<h3>${_crm.pacientes.length ? 'Nenhum resultado' : 'Nenhum paciente cadastrado'}</h3><p>${_crm.pacientes.length ? 'Ajuste a busca ou o filtro.' : 'Clique em “Novo Paciente” para começar.'}</p></div>`;
    return;
  }
  el.innerHTML = `<table><thead><tr>
    <th>Nome</th><th>Contato</th><th>Status</th><th>Interesse</th><th>Próximo contato</th><th style="text-align:right">Ações</th>
  </tr></thead><tbody>
  ${items.map(p => {
    const st = CRM_STATUS[p.status] || CRM_STATUS.novo;
    const wa = crmWhatsLink(p.telefone);
    return `<tr>
      <td class="fw-600"><button class="crm-name-link" onclick="openCrmDetail('${p.id}')">${esc(p.nome)}</button>
        ${p.origem && p.origem !== 'outro' ? `<span class="crm-origem">${CRM_ORIGEM[p.origem] || p.origem}</span>` : ''}</td>
      <td class="fs-13 color-2 no-wrap">${p.telefone ? esc(p.telefone) : '—'}</td>
      <td><span class="badge ${st.badge}">${st.label}</span></td>
      <td class="fs-13">${p.interesse ? esc(p.interesse) : '—'}</td>
      <td class="fs-13 color-2 no-wrap">${p.proximoContato ? fDate(p.proximoContato) : '—'}</td>
      <td><div class="td-actions">
        ${wa ? `<a class="btn btn-ghost btn-icon crm-wa" href="${wa}" target="_blank" rel="noopener" title="Abrir WhatsApp" aria-label="Abrir WhatsApp de ${esc(p.nome)}">${iconWhats()}</a>` : ''}
        <button class="btn btn-ghost btn-icon" title="Ver / Histórico" aria-label="Ver ${esc(p.nome)}" onclick="openCrmDetail('${p.id}')">${iconEye()}</button>
        <button class="btn btn-ghost btn-icon" title="Editar" aria-label="Editar ${esc(p.nome)}" onclick="openCrmModal('${p.id}')">${iconEdit()}</button>
        <button class="btn btn-danger btn-icon" title="Excluir" aria-label="Excluir ${esc(p.nome)}" onclick="deleteCrmPaciente('${p.id}')">${iconTrash()}</button>
      </div></td>
    </tr>`;
  }).join('')}
  </tbody></table>`;
}

/* ===== Modal — Novo / Editar paciente ===== */
function openCrmModal(id = null) {
  const p = id ? _crm.pacientes.find(x => x.id === id) : null;
  const opt = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${typeof v === 'string' ? v : v.label}</option>`).join('');

  openModal(id ? 'Editar Paciente' : 'Novo Paciente', `
    <form onsubmit="saveCrmPaciente(event)">
      <input type="hidden" id="crmId" value="${p?.id || ''}" />
      <div class="form-grid">
        <div class="form-group form-full">
          <label class="form-label" for="crmNome">Nome *</label>
          <input type="text" class="form-control" id="crmNome" value="${esc(p?.nome || '')}" placeholder="Nome completo" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="crmTelefone">Telefone / WhatsApp</label>
          <input type="text" class="form-control" id="crmTelefone" value="${esc(p?.telefone || '')}" placeholder="(81) 9 9999-9999" />
        </div>
        <div class="form-group">
          <label class="form-label" for="crmEmail">E-mail</label>
          <input type="email" class="form-control" id="crmEmail" value="${esc(p?.email || '')}" placeholder="email@exemplo.com" />
        </div>
        <div class="form-group">
          <label class="form-label" for="crmStatus">Status no funil *</label>
          <select class="form-control" id="crmStatus" required>${opt(CRM_STATUS, p?.status || 'novo')}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="crmOrigem">Origem do lead</label>
          <select class="form-control" id="crmOrigem">${opt(CRM_ORIGEM, p?.origem || 'outro')}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="crmInteresse">Procedimento de interesse</label>
          <input type="text" class="form-control" id="crmInteresse" value="${esc(p?.interesse || '')}" placeholder="Ex.: Botox, preenchimento…" />
        </div>
        <div class="form-group">
          <label class="form-label" for="crmProximo">Próximo contato</label>
          <input type="date" class="form-control" id="crmProximo" value="${p?.proximoContato || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="crmNascimento">Data de nascimento</label>
          <input type="date" class="form-control" id="crmNascimento" value="${p?.nascimento || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="crmInstagram">Instagram</label>
          <input type="text" class="form-control" id="crmInstagram" value="${esc(p?.instagram || '')}" placeholder="@usuario" />
        </div>
        <div class="form-group form-full">
          <label class="form-label" for="crmObs">Observações</label>
          <textarea class="form-control" id="crmObs" rows="3" placeholder="Anotações gerais sobre o paciente…">${esc(p?.observacoes || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">${iconCheck()} ${id ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`, true);
}

async function saveCrmPaciente(ev) {
  ev.preventDefault();
  if (!currentUser) { toast('Faça login para salvar.', 'error'); return; }
  const id = document.getElementById('crmId').value || null;
  const nome = document.getElementById('crmNome').value.trim();
  if (!nome) { toast('Informe o nome.', 'error'); return; }
  const payload = {
    nome,
    telefone:        document.getElementById('crmTelefone').value.trim() || null,
    email:           document.getElementById('crmEmail').value.trim() || null,
    status:          document.getElementById('crmStatus').value,
    origem:          document.getElementById('crmOrigem').value,
    interesse:       document.getElementById('crmInteresse').value.trim() || null,
    proximo_contato: document.getElementById('crmProximo').value || null,
    nascimento:      document.getElementById('crmNascimento').value || null,
    instagram:       document.getElementById('crmInstagram').value.trim() || null,
    observacoes:     document.getElementById('crmObs').value.trim() || null,
    updated_at:      new Date().toISOString()
  };
  let error;
  if (id) {
    ({ error } = await db('crm_pacientes').update(payload).eq('id', id));
  } else {
    ({ error } = await db('crm_pacientes').insert({ id: uid(), user_id: currentUser.id, ...payload }));
  }
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
  toast(id ? 'Paciente atualizado!' : 'Paciente adicionado!', 'success');
  closeModal();
  await loadCrm();
}

async function deleteCrmPaciente(id) {
  if (!confirm('Excluir este paciente e todo o histórico dele?')) return;
  const { error } = await db('crm_pacientes').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  toast('Paciente excluído.', 'success');
  await loadCrm();
}

/* ===== Detalhe + linha do tempo de interações ===== */
async function openCrmDetail(id) {
  const p = _crm.pacientes.find(x => x.id === id);
  if (!p) return;
  const st = CRM_STATUS[p.status] || CRM_STATUS.novo;
  const wa = crmWhatsLink(p.telefone);

  openModal(p.nome, `
    <div class="crm-detail">
      <div class="crm-detail-head">
        <span class="badge ${st.badge}">${st.label}</span>
        ${p.origem && p.origem !== 'outro' ? `<span class="crm-origem">${CRM_ORIGEM[p.origem] || p.origem}</span>` : ''}
        <div class="crm-detail-actions">
          ${wa ? `<a class="btn btn-secondary btn-sm" href="${wa}" target="_blank" rel="noopener">${iconWhats()} WhatsApp</a>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="openCrmModal('${p.id}')">${iconEdit()} Editar</button>
        </div>
      </div>
      <div class="crm-detail-grid">
        ${crmInfo('Telefone', p.telefone)}
        ${crmInfo('E-mail', p.email)}
        ${crmInfo('Interesse', p.interesse)}
        ${crmInfo('Instagram', p.instagram)}
        ${crmInfo('Nascimento', p.nascimento ? fDate(p.nascimento) : '')}
        ${crmInfo('Próximo contato', p.proximoContato ? fDate(p.proximoContato) : '')}
      </div>
      ${p.observacoes ? `<div class="crm-detail-obs"><span class="crm-info-label">Observações</span><p>${esc(p.observacoes)}</p></div>` : ''}

      <div class="crm-timeline-head">
        <span class="doc-block-title" style="padding:0">Linha do tempo</span>
      </div>
      <form class="crm-add-interacao" onsubmit="addInteracao(event, '${p.id}')">
        <select class="form-control" id="intTipo">${Object.entries(CRM_TIPO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input type="text" class="form-control" id="intDesc" placeholder="Descreva o contato/atendimento…" required />
        <button type="submit" class="btn btn-primary btn-sm">${iconPlus()} Registrar</button>
      </form>
      <div id="crmTimeline"><div class="doc-list-empty">Carregando histórico…</div></div>
    </div>`, true);

  loadInteracoes(p.id);
}

function crmInfo(label, value) {
  return `<div class="crm-info"><span class="crm-info-label">${label}</span><span class="crm-info-value">${value ? esc(value) : '—'}</span></div>`;
}

async function loadInteracoes(pacienteId) {
  const el = document.getElementById('crmTimeline');
  if (!el) return;
  const { data, error } = await db('crm_interacoes').select('*').eq('paciente_id', pacienteId).order('data', { ascending: false });
  if (error) { el.innerHTML = `<div class="doc-list-empty">Erro ao carregar histórico.</div>`; return; }
  const items = data || [];
  if (!items.length) { el.innerHTML = `<div class="doc-list-empty">Nenhum contato registrado ainda.</div>`; return; }
  el.innerHTML = `<div class="crm-timeline">${items.map(it => `
    <div class="crm-tl-item">
      <div class="crm-tl-dot"></div>
      <div class="crm-tl-body">
        <div class="crm-tl-top">
          <span class="badge badge-gray">${CRM_TIPO[it.tipo] || it.tipo}</span>
          <span class="crm-tl-date">${it.data ? fDate(it.data) : ''}</span>
          <button class="crm-tl-del" title="Excluir" aria-label="Excluir interação" onclick="deleteInteracao('${it.id}','${pacienteId}')">${iconTrash()}</button>
        </div>
        <p class="crm-tl-desc">${esc(it.descricao || '')}</p>
      </div>
    </div>`).join('')}</div>`;
}

async function addInteracao(ev, pacienteId) {
  ev.preventDefault();
  if (!currentUser) { toast('Faça login.', 'error'); return; }
  const tipo = document.getElementById('intTipo').value;
  const descricao = document.getElementById('intDesc').value.trim();
  if (!descricao) return;
  const { error } = await db('crm_interacoes').insert({
    id: uid(), user_id: currentUser.id, paciente_id: pacienteId,
    tipo, descricao, data: today()
  });
  if (error) { toast('Erro ao registrar.', 'error'); return; }
  document.getElementById('intDesc').value = '';
  toast('Contato registrado!', 'success');
  loadInteracoes(pacienteId);
}

async function deleteInteracao(id, pacienteId) {
  const { error } = await db('crm_interacoes').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  loadInteracoes(pacienteId);
}

/* ===== Ícones extras usados no CRM ===== */
const iconUsers    = () => svg('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>');
const iconSpark    = () => svg('<path d="M12 3l1.9 5.8L20 10.7l-5.1 3.7L16 21l-4-3.3L8 21l1.1-6.6L4 10.7l6.1-1.9z"/>');
const iconCalendar = () => svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>');
const iconHeart    = () => svg('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 10-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/>');
const iconEye      = () => svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');
const iconWhats    = () => svg('<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>');
