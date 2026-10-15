/* ============================================================
   ClinicFinance — kanban.js
   CRM: visão Kanban do funil (arrastar cards entre etapas) e
   etiquetas coloridas por paciente. Tabelas: crm_etiquetas +
   coluna crm_pacientes.etiquetas (ver etiquetas.sql).
   ============================================================ */

const KB_PAGE = 40; // cards por coluna antes do "ver mais"
const TAG_CORES = ['#C98A72', '#C9A06A', '#D2AE7C', '#8FA88A', '#7F9C7A', '#8DA0AC', '#B39AA7', '#B39581', '#9A7238', '#A88B76'];
const TAGS_SUGERIDAS = [
  ['🔥 Quente', '#C98A72'], ['Pediu preço', '#C9A06A'], ['Botox', '#8DA0AC'], ['Harmonização', '#B39AA7'],
  ['Preenchimento', '#D2AE7C'], ['Indicação', '#8FA88A'], ['Instagram', '#B39581'], ['Sinal pago', '#7F9C7A'], ['VIP', '#9A7238']
];

Object.assign(_crm, { tags: [], tagsReady: false, tagFilter: [], colLimit: {}, editTags: new Set() });
_crm.view = (() => { try { return localStorage.getItem('cf_crm_view') === 'kanban' ? 'kanban' : 'lista'; } catch (e) { return 'lista'; } })();

/* ===== Carga das etiquetas (tabela pode não existir ainda) ===== */
async function crmLoadTags() {
  if (typeof currentUser === 'undefined' || !currentUser) return;
  const { data, error } = await db('crm_etiquetas').select('*').eq('user_id', currentUser.id).order('ordem');
  _crm.tagsReady = !error;
  _crm.tags = error ? [] : (data || []).map(t => ({ id: t.id, nome: t.nome, cor: t.cor || '#B39581', ordem: t.ordem || 0 }));
}
const crmTagById = id => _crm.tags.find(t => t.id === id);

/* ===== Chips ===== */
function tagChip(t, extra = '') {
  return `<span class="tag-chip" style="--tag:${t.cor}" ${extra}>${esc(t.nome)}</span>`;
}
function crmTagChips(p, max = 3) {
  const ts = (p.etiquetas || []).map(crmTagById).filter(Boolean);
  if (!ts.length) return '';
  const shown = ts.slice(0, max).map(t => tagChip(t)).join('');
  return `<span class="tag-row">${shown}${ts.length > max ? `<span class="tag-more">+${ts.length - max}</span>` : ''}</span>`;
}

/* ===== Alternar Lista / Kanban ===== */
function crmSetView(v) {
  _crm.view = v;
  try { localStorage.setItem('cf_crm_view', v); } catch (e) {}
  document.querySelectorAll('.crm-view-toggle button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  const list = document.getElementById('crmListWrap'), board = document.getElementById('crmBoardWrap');
  if (list) list.style.display = v === 'lista' ? '' : 'none';
  if (board) board.style.display = v === 'kanban' ? '' : 'none';
  if (v === 'kanban') renderKanban(); else renderCrmTable();
  renderCrmCharts(); // métricas só na visão Lista (no Kanban o quadro sobe)
}

/* ===== Filtro por etiqueta ===== */
function renderTagFilter() {
  const el = document.getElementById('crmTagFilter');
  if (!el) return;
  if (!_crm.tagsReady || !_crm.tags.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<span class="tag-filter-label">Etiquetas:</span>` + _crm.tags.map(t =>
    `<button type="button" class="tag-chip tag-toggle${_crm.tagFilter.includes(t.id) ? ' on' : ''}" style="--tag:${t.cor}" onclick="crmToggleTagFilter('${t.id}')">${esc(t.nome)}</button>`
  ).join('') + (_crm.tagFilter.length ? `<button type="button" class="link-btn" onclick="crmClearTagFilter()">Limpar</button>` : '');
}
function crmToggleTagFilter(id) {
  const i = _crm.tagFilter.indexOf(id);
  if (i >= 0) _crm.tagFilter.splice(i, 1); else _crm.tagFilter.push(id);
  crmRefreshViews();
}
function crmClearTagFilter() { _crm.tagFilter = []; crmRefreshViews(); }
function crmRefreshViews() {
  renderTagFilter();
  if (_crm.view === 'kanban') renderKanban(); else renderCrmTable();
}

/* ===== Kanban ===== */
function renderKanban() {
  const el = document.getElementById('crmBoard');
  if (!el) return;
  const items = crmFiltered(true);
  const fin = crmFinIndex();
  const hoje = today();
  const countEl = document.getElementById('crmBoardCount');
  if (countEl) countEl.textContent = `${items.length} paciente${items.length !== 1 ? 's' : ''}`;

  el.innerHTML = Object.entries(CRM_STATUS).map(([k, st]) => {
    const col = items.filter(p => p.status === k);
    const lim = _crm.colLimit[k] || KB_PAGE;
    const cards = col.slice(0, lim).map(p => {
      const f = fin.get(crmNorm(p.nome));
      const atrasado = p.proximoContato && p.proximoContato <= hoje;
      const wa = crmWhatsLink(p.telefone);
      return `<article class="kb-card" draggable="true" data-id="${p.id}"
          ondragstart="kbDragStart(event,'${p.id}')" ondragend="kbDragEnd(event)" onclick="openCrmDetail('${p.id}')"
          tabindex="0" onkeydown="if(event.key==='Enter')openCrmDetail('${p.id}')" aria-label="${esc(p.nome)}">
        <div class="kb-card-top">
          <span class="kb-avatar">${esc(p.nome.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>
          <span class="kb-name">${esc(p.nome)}</span>
        </div>
        ${crmTagChips(p, 3)}
        ${p.interesse ? `<div class="kb-line">${esc(p.interesse)}</div>` : ''}
        <div class="kb-foot">
          ${f ? `<span class="kb-money" title="${f.n} atendimento(s)">${fCurrency(f.total)}</span>` : '<span></span>'}
          <span class="kb-foot-right">
            ${p.proximoContato ? `<span class="kb-date${atrasado ? ' late' : ''}" title="Próximo contato">${fDateShort(p.proximoContato)}</span>` : ''}
            ${wa ? `<a class="kb-wa" href="${wa}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="WhatsApp" aria-label="WhatsApp de ${esc(p.nome)}">${iconWhats()}</a>` : ''}
            <select class="kb-move" aria-label="Mover ${esc(p.nome)} para outra etapa" onclick="event.stopPropagation()" onchange="kbMove('${p.id}', this.value)">
              ${Object.entries(CRM_STATUS).map(([s, v]) => `<option value="${s}" ${s === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
          </span>
        </div>
      </article>`;
    }).join('');
    return `<section class="kb-col" data-status="${k}">
      <header class="kb-col-head"><span class="kb-dot ${st.badge}"></span><span class="kb-col-title">${st.label}</span><span class="kb-col-n">${col.length}</span></header>
      <div class="kb-col-body" ondragover="kbDragOver(event)" ondragleave="kbDragLeave(event)" ondrop="kbDrop(event,'${k}')">
        ${cards || `<div class="kb-empty">Arraste um card para cá</div>`}
        ${col.length > lim ? `<button type="button" class="kb-more" onclick="kbMore('${k}')">Ver mais ${Math.min(KB_PAGE, col.length - lim)} de ${col.length - lim}</button>` : ''}
      </div>
    </section>`;
  }).join('');
}
function kbMore(k) { _crm.colLimit[k] = (_crm.colLimit[k] || KB_PAGE) + KB_PAGE; renderKanban(); }

/* Arrastar e soltar (mouse). No toque, use o seletor "mover" do card. */
let _kbDragId = null;
function kbDragStart(ev, id) {
  _kbDragId = id;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', id); } catch (e) {}
  ev.currentTarget.classList.add('dragging');
}
function kbDragEnd(ev) { ev.currentTarget.classList.remove('dragging'); document.querySelectorAll('.kb-col-body.over').forEach(x => x.classList.remove('over')); }
function kbDragOver(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; ev.currentTarget.classList.add('over'); }
function kbDragLeave(ev) { if (!ev.currentTarget.contains(ev.relatedTarget)) ev.currentTarget.classList.remove('over'); }
function kbDrop(ev, status) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('over');
  const id = _kbDragId || ev.dataTransfer.getData('text/plain');
  _kbDragId = null;
  if (id) kbMove(id, status);
}

async function kbMove(id, status) {
  const p = _crm.pacientes.find(x => x.id === id);
  if (!p || p.status === status) return;
  const antes = p.status;
  p.status = status; // otimista: move na hora
  renderKanban(); renderCrmStats(); renderCrmFilters();
  const { error } = await db('crm_pacientes').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) {
    p.status = antes;
    renderKanban(); renderCrmStats(); renderCrmFilters();
    toast('Não foi possível mover: ' + (error.message || 'erro'), 'error');
    return;
  }
  toast(`${p.nome} → ${CRM_STATUS[status].label}`, 'success');
}

/* ===== Etiquetas no cadastro do paciente ===== */
function crmTagPickerHTML(p) {
  if (!_crm.tagsReady) return '';
  _crm.editTags = new Set(p?.etiquetas || []);
  const chips = _crm.tags.map(t =>
    `<button type="button" class="tag-chip tag-toggle${_crm.editTags.has(t.id) ? ' on' : ''}" style="--tag:${t.cor}" data-tag="${t.id}" onclick="crmToggleEditTag(this)">${esc(t.nome)}</button>`
  ).join('');
  return `<div class="form-group form-full">
    <label class="form-label">Etiquetas</label>
    <div class="tag-picker">${chips || '<span class="form-hint">Nenhuma etiqueta criada ainda.</span>'}
      <button type="button" class="link-btn" onclick="openTagsModal(true)">Gerenciar etiquetas</button></div>
  </div>`;
}
function crmToggleEditTag(btn) {
  const id = btn.dataset.tag;
  if (_crm.editTags.has(id)) _crm.editTags.delete(id); else _crm.editTags.add(id);
  btn.classList.toggle('on');
}

/* ===== Gerenciar etiquetas ===== */
let _tagsReturnTo = null; // reabre o paciente que estava sendo editado
function openTagsModal(fromPatient = false) {
  _tagsReturnTo = fromPatient ? (document.getElementById('crmId')?.value || 'new') : null;
  if (!_crm.tagsReady) {
    openModal('Etiquetas', `<div class="tags-setup">
      <p>Para usar etiquetas, rode uma vez o arquivo <code>etiquetas.sql</code> no Supabase (SQL Editor → New query → Run) e recarregue a página.</p>
    </div>
    <div class="form-actions"><button class="btn btn-primary" onclick="closeModal()">Entendi</button></div>`);
    return;
  }
  openModal('Etiquetas', `<div class="tags-manage">
    <div id="tagsList">${tagsListHTML()}</div>
    <div class="tags-new">
      <input type="text" class="form-control" id="tagNovoNome" placeholder="Nova etiqueta (ex.: Pediu preço)" maxlength="30" onkeydown="if(event.key==='Enter'){event.preventDefault();addTag()}" />
      <div class="tag-colors" id="tagNovaCor">${TAG_CORES.map((c, i) => `<button type="button" class="tag-color${i === 0 ? ' on' : ''}" style="background:${c}" data-cor="${c}" aria-label="Cor ${c}" onclick="pickTagColor(this)"></button>`).join('')}</div>
      <button type="button" class="btn btn-primary btn-sm" onclick="addTag()">${iconPlus()} Adicionar</button>
    </div>
    ${!_crm.tags.length ? `<button type="button" class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="createSuggestedTags()">Criar etiquetas sugeridas (${TAGS_SUGERIDAS.length})</button>` : ''}
  </div>
  <div class="form-actions"><button class="btn btn-secondary" onclick="closeTagsModal()">Concluir</button></div>`);
}
function tagsListHTML() {
  if (!_crm.tags.length) return `<div class="doc-list-empty">Nenhuma etiqueta ainda. Crie abaixo ou use as sugeridas.</div>`;
  const uso = id => _crm.pacientes.filter(p => (p.etiquetas || []).includes(id)).length;
  return _crm.tags.map(t => `<div class="tag-item">
    <span class="tag-swatch" style="background:${t.cor}"></span>
    <input class="form-control tag-name-input" value="${esc(t.nome)}" maxlength="30" aria-label="Nome da etiqueta" onchange="renameTag('${t.id}', this.value)" />
    <span class="tag-uso">${uso(t.id)} paciente(s)</span>
    <button type="button" class="btn btn-danger btn-icon" title="Excluir etiqueta" aria-label="Excluir etiqueta ${esc(t.nome)}" onclick="deleteTag('${t.id}')">${iconTrash()}</button>
  </div>`).join('');
}
function pickTagColor(btn) { document.querySelectorAll('#tagNovaCor .tag-color').forEach(b => b.classList.remove('on')); btn.classList.add('on'); }

async function addTag(nome, cor) {
  nome = (nome ?? document.getElementById('tagNovoNome')?.value ?? '').trim();
  cor = cor || document.querySelector('#tagNovaCor .tag-color.on')?.dataset.cor || TAG_CORES[0];
  if (!nome) { toast('Digite o nome da etiqueta.', 'error'); return false; }
  if (_crm.tags.some(t => crmNorm(t.nome) === crmNorm(nome))) { toast('Essa etiqueta já existe.', 'error'); return false; }
  const t = { id: uid(), user_id: currentUser.id, nome, cor, ordem: _crm.tags.length };
  const { error } = await db('crm_etiquetas').insert(t);
  if (error) { toast('Erro ao criar etiqueta: ' + (error.message || ''), 'error'); return false; }
  _crm.tags.push({ id: t.id, nome, cor, ordem: t.ordem });
  const inp = document.getElementById('tagNovoNome'); if (inp) inp.value = '';
  const list = document.getElementById('tagsList'); if (list) list.innerHTML = tagsListHTML();
  return true;
}
async function createSuggestedTags() {
  const rows = TAGS_SUGERIDAS.filter(([n]) => !_crm.tags.some(t => crmNorm(t.nome) === crmNorm(n)))
    .map(([nome, cor], i) => ({ id: uid(), user_id: currentUser.id, nome, cor, ordem: _crm.tags.length + i }));
  if (!rows.length) return;
  const { error } = await db('crm_etiquetas').insert(rows);
  if (error) { toast('Erro ao criar etiquetas: ' + (error.message || ''), 'error'); return; }
  rows.forEach(r => _crm.tags.push({ id: r.id, nome: r.nome, cor: r.cor, ordem: r.ordem }));
  toast(`${rows.length} etiquetas criadas!`, 'success');
  openTagsModal(_tagsReturnTo !== null);
}
async function renameTag(id, nome) {
  nome = (nome || '').trim();
  const t = crmTagById(id);
  if (!t || !nome || nome === t.nome) return;
  const { error } = await db('crm_etiquetas').update({ nome }).eq('id', id);
  if (error) { toast('Erro ao renomear.', 'error'); return; }
  t.nome = nome;
  toast('Etiqueta renomeada.', 'success');
}
async function deleteTag(id) {
  const t = crmTagById(id);
  if (!t) return;
  const usados = _crm.pacientes.filter(p => (p.etiquetas || []).includes(id));
  if (!confirm(`Excluir a etiqueta "${t.nome}"?${usados.length ? ` Ela sai de ${usados.length} paciente(s).` : ''}`)) return;
  const { error } = await db('crm_etiquetas').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  _crm.tags = _crm.tags.filter(x => x.id !== id);
  _crm.tagFilter = _crm.tagFilter.filter(x => x !== id);
  for (const p of usados) {
    p.etiquetas = p.etiquetas.filter(x => x !== id);
    await db('crm_pacientes').update({ etiquetas: p.etiquetas }).eq('id', p.id);
  }
  const list = document.getElementById('tagsList'); if (list) list.innerHTML = tagsListHTML();
  toast('Etiqueta excluída.', 'success');
}
function closeTagsModal() {
  const back = _tagsReturnTo;
  _tagsReturnTo = null;
  closeModal();
  crmRefreshViews();
  if (back) openCrmModal(back === 'new' ? null : back);
}
