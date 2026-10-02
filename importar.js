/* ============================================================
   ClinicFinance — importar.js
   Importação de planilhas (Zandu): pacientes + vendas.
   - Pacientes  → crm_pacientes (cruzados pelo telefone)
   - Vendas     → entradas (valor pago) + crm_interacoes (histórico de compras)
   Reimportar o mesmo arquivo não duplica (compara com o que já existe).
   ============================================================ */

const _imp = { pacientes: null, vendas: null, plano: null };

/* Contatos de teste que nunca devem ser importados (telefone ou nome) */
const IMP_EXCLUIR_PADRAO = ['5534984278681 — Hugo Treinamento (teste)'];

/* ===== Parser CSV (detecta ; ou , e respeita aspas) ===== */
function impParseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(h => crmNorm(h).replace(/\s+/g, '_'));
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

/* Chave do telefone: DDD + últimos 8 dígitos (ignora +55 e o 9º dígito) */
function impPhoneKey(...vals) {
  for (const v of vals) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
    if (d.length >= 10) return d.slice(0, 2) + d.slice(-8);
  }
  return '';
}

/* "(81)99320-4482" → "(81) 99320-4482" */
function impFmtPhone(tel, wa) {
  let d = String(wa || tel || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return (tel || '').trim();
}

const impNum = v => { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const impMoneyKey = v => (Math.round(v * 100) / 100).toFixed(2);

/* ===== Modal ===== */
function openImportModal() {
  _imp.pacientes = null; _imp.vendas = null; _imp.plano = null;
  openModal('Importar planilhas', `
    <div class="imp-wrap">
      <p class="imp-intro">Selecione as planilhas exportadas (CSV). Pode escolher as duas de uma vez:</p>
      <ul class="imp-list">
        <li><b>Pacientes</b> — colunas <code>Nome; Telefone; WhatsApp</code> → vão para o CRM.</li>
        <li><b>Vendas</b> — colunas <code>data, paciente, telefone, whatsapp, valor_comprado, valor_pago</code> → viram Entradas e histórico de compras do paciente.</li>
      </ul>
      <label class="imp-drop">
        <input type="file" accept=".csv,text/csv" multiple onchange="impHandleFiles(this.files)" />
        <span>${iconUpload()} Escolher arquivos CSV</span>
      </label>
      <div id="impFiles" class="imp-files"></div>
      <div class="form-group" style="margin-top:14px">
        <label class="form-label" for="impExcluir">Não importar (contatos de teste) — um telefone ou nome por linha</label>
        <textarea class="form-control" id="impExcluir" rows="2" onchange="impBuildPlan()">${esc(IMP_EXCLUIR_PADRAO.join('\n'))}</textarea>
      </div>
      <div id="impPreview"></div>
    </div>`, true);
}

async function impHandleFiles(files) {
  const info = [];
  for (const f of files) {
    const rows = impParseCsv(await f.text());
    const cols = rows.length ? Object.keys(rows[0]) : [];
    if (cols.includes('valor_pago') || cols.includes('valor_comprado')) { _imp.vendas = rows; info.push(`✔ ${esc(f.name)} — ${rows.length} vendas`); }
    else if (cols.includes('nome')) { _imp.pacientes = rows; info.push(`✔ ${esc(f.name)} — ${rows.length} pacientes`); }
    else info.push(`✖ ${esc(f.name)} — formato não reconhecido`);
  }
  const el = document.getElementById('impFiles');
  if (el) el.innerHTML = info.map(t => `<div>${t}</div>`).join('');
  await impBuildPlan();
}

/* ===== Monta o plano (nada é gravado ainda) ===== */
async function impBuildPlan() {
  const prev = document.getElementById('impPreview');
  if (!prev) return;
  if (!_imp.pacientes && !_imp.vendas) { prev.innerHTML = ''; return; }
  if (typeof currentUser === 'undefined' || !currentUser) { prev.innerHTML = `<div class="doc-list-empty">Faça login para importar.</div>`; return; }
  prev.innerHTML = `<div class="doc-list-empty">Analisando e cruzando os dados…</div>`;

  const uidv = currentUser.id;
  const [crmR, intR] = await Promise.all([
    db('crm_pacientes').select('id,nome,telefone,status,observacoes').eq('user_id', uidv),
    db('crm_interacoes').select('paciente_id,data,descricao').eq('user_id', uidv).eq('tipo', 'compra')
  ]);
  if (crmR.error) { prev.innerHTML = `<div class="doc-list-empty">Erro ao ler o CRM: ${esc(crmR.error.message || '')}</div>`; return; }
  const existentes = crmR.data || [];

  // Índices dos pacientes que já estão no CRM
  const byPhone = new Map(), byName = new Map();
  existentes.forEach(p => {
    const k = impPhoneKey(p.telefone);
    if (k && !byPhone.has(k)) byPhone.set(k, p);
    const n = crmNorm(p.nome);
    if (n && !byName.has(n)) byName.set(n, p);
  });

  // 0) Lista de exclusão (contatos de teste): casa por telefone ou por nome
  const excl = (document.getElementById('impExcluir')?.value || '').split('\n').map(l => l.trim()).filter(Boolean);
  const exclPhones = new Set(excl.map(l => impPhoneKey(l.split(/\s[—-]\s/)[0])).filter(Boolean));
  const exclNames = new Set(excl.filter(l => !impPhoneKey(l.split(/\s[—-]\s/)[0])).map(crmNorm));
  const excluido = (nome, tel, wa) => exclPhones.has(impPhoneKey(wa, tel)) || exclNames.has(crmNorm(nome));
  const ex = { pacientes: 0, vendas: 0, pago: 0 };

  // 1) Une pacientes da planilha + quem aparece só nas vendas
  const pessoas = new Map(); // chave → { nome, telefone, vendas: [] }
  const keyOf = (nome, tel, wa) => impPhoneKey(wa, tel) || 'n:' + crmNorm(nome);
  (_imp.pacientes || []).forEach(r => {
    const nome = (r.nome || '').trim();
    if (!nome) return;
    if (excluido(nome, r.telefone, r.whatsapp)) { ex.pacientes++; return; }
    const k = keyOf(nome, r.telefone, r.whatsapp);
    if (!pessoas.has(k)) pessoas.set(k, { nome, telefone: impFmtPhone(r.telefone, r.whatsapp), vendas: [] });
  });
  const vendas = (_imp.vendas || []).map(r => ({
    data: (r.data || '').slice(0, 10),
    hora: (r.data || '').slice(11, 19),
    nome: (r.paciente || '').trim(),
    tel: r.telefone, wa: r.whatsapp,
    comprado: impNum(r.valor_comprado), pago: impNum(r.valor_pago)
  })).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v.data) && v.nome)
    .filter(v => { if (excluido(v.nome, v.tel, v.wa)) { ex.vendas++; ex.pago += v.pago; return false; } return true; });

  // Linhas idênticas (mesmo paciente, horário e valores)
  const seenLinha = new Set();
  vendas.forEach(v => {
    const lk = [keyOf(v.nome, v.tel, v.wa), v.data, v.hora, v.comprado, v.pago].join('|');
    v.repetida = seenLinha.has(lk);
    seenLinha.add(lk);
  });
  const ignorarRepetidas = !!document.getElementById('impSkipDup')?.checked;

  let soNasVendas = 0;
  vendas.forEach(v => {
    if (ignorarRepetidas && v.repetida) return;
    const k = keyOf(v.nome, v.tel, v.wa);
    if (!pessoas.has(k)) { pessoas.set(k, { nome: v.nome, telefone: impFmtPhone(v.tel, v.wa), vendas: [] }); soNasVendas++; }
    pessoas.get(k).vendas.push(v);
  });

  // 2) Para cada pessoa: casa com o CRM, calcula status e saldo
  const hoje = new Date(today() + 'T12:00:00');
  const novos = [], atualizar = [];
  const resumo = { pessoas: pessoas.size, soNasVendas, existentes: 0, novos: 0, cliente: 0, retorno: 0, inativo: 0, saldoAberto: [] };
  pessoas.forEach((p, k) => {
    const match = (!k.startsWith('n:') && byPhone.get(k)) || byName.get(crmNorm(p.nome));
    const ultima = p.vendas.reduce((m, v) => (v.data > m ? v.data : m), '');
    const dias = ultima ? Math.round((hoje - new Date(ultima + 'T12:00:00')) / 86400000) : null;
    const status = ultima == null || ultima === '' ? 'inativo' : (dias <= 90 ? 'cliente' : 'retorno');
    const saldo = p.vendas.reduce((s, v) => s + v.comprado - v.pago, 0);
    p.status = status; p.ultima = ultima; p.saldo = Math.round(saldo * 100) / 100;
    if (p.saldo >= 1) resumo.saldoAberto.push({ nome: p.nome, saldo: p.saldo });
    resumo[status]++;

    const notaSaldo = p.saldo >= 1 ? `Saldo em aberto no Zandu: ${fCurrency(p.saldo)} (até ${fDate(ultima)}).` : '';
    if (match) {
      resumo.existentes++;
      p.id = match.id; p.nome = match.nome; // usa o nome do CRM → cruza com Entradas/Documentos
      const upd = {};
      if (!match.telefone && p.telefone) upd.telefone = p.telefone;
      if (['novo', 'contato', 'inativo'].includes(match.status) && status !== 'inativo') upd.status = status;
      if (notaSaldo && !(match.observacoes || '').includes('Saldo em aberto no Zandu')) upd.observacoes = [match.observacoes, notaSaldo].filter(Boolean).join('\n');
      if (Object.keys(upd).length) atualizar.push({ id: match.id, upd });
    } else {
      resumo.novos++;
      p.id = uid();
      novos.push({
        id: p.id, user_id: uidv, nome: p.nome, telefone: p.telefone || null,
        origem: 'outro', status,
        observacoes: ['Importado do Zandu.', notaSaldo].filter(Boolean).join(' ')
      });
    }
  });

  // 3) Entradas (só valor pago > 0) — sem duplicar o que já está lançado
  const contaExist = new Map();
  (state.data.entries || []).forEach(e => {
    const ek = `${e.date}|${crmNorm(e.clientName)}|${impMoneyKey(e.value)}`;
    contaExist.set(ek, (contaExist.get(ek) || 0) + 1);
  });
  const entradas = [];
  let entradasJaExistem = 0, semPagamento = 0, totalPago = 0, totalComprado = 0;
  pessoas.forEach(p => p.vendas.forEach(v => {
    totalComprado += v.comprado;
    if (v.pago <= 0) { semPagamento++; return; }
    const ek = `${v.data}|${crmNorm(p.nome)}|${impMoneyKey(v.pago)}`;
    if (contaExist.get(ek) > 0) { contaExist.set(ek, contaExist.get(ek) - 1); entradasJaExistem++; return; }
    totalPago += v.pago;
    entradas.push({ id: uid(), user_id: uidv, date: v.data, client_name: p.nome, procedure: 'outros', value: Math.round(v.pago * 100) / 100, payment: 'nao_informado' });
  }));

  // 4) Histórico de compras na linha do tempo do paciente
  const contaInt = new Map();
  (intR.data || []).forEach(i => { const ik = `${i.paciente_id}|${i.data}|${i.descricao}`; contaInt.set(ik, (contaInt.get(ik) || 0) + 1); });
  const interacoes = [];
  pessoas.forEach(p => p.vendas.forEach(v => {
    let desc = v.comprado || v.pago
      ? `Venda Zandu — ${fCurrency(v.comprado)} · pago ${fCurrency(v.pago)}`
      : 'Atendimento Zandu — sem cobrança';
    if (v.comprado - v.pago >= 1) desc += ` (em aberto ${fCurrency(v.comprado - v.pago)})`;
    const ik = `${p.id}|${v.data}|${desc}`;
    if (contaInt.get(ik) > 0) { contaInt.set(ik, contaInt.get(ik) - 1); return; }
    interacoes.push({ id: uid(), user_id: uidv, paciente_id: p.id, tipo: 'compra', data: v.data, descricao: desc });
  }));

  const repetidas = vendas.filter(v => v.repetida).length;
  const periodo = vendas.length ? [vendas.reduce((m, v) => v.data < m ? v.data : m, vendas[0].data), vendas.reduce((m, v) => v.data > m ? v.data : m, vendas[0].data)] : null;
  _imp.plano = { novos, atualizar, entradas, interacoes };
  resumo.saldoAberto.sort((a, b) => b.saldo - a.saldo);

  prev.innerHTML = `
    <div class="imp-summary">
      <div class="imp-sum-title">O que será feito</div>
      <div class="imp-grid">
        <div class="imp-stat"><b>${novos.length}</b><span>pacientes novos no CRM</span></div>
        <div class="imp-stat"><b>${resumo.existentes}</b><span>já estavam no CRM (atualizados${atualizar.length ? `: ${atualizar.length}` : ''})</span></div>
        <div class="imp-stat"><b>${entradas.length}</b><span>entradas · ${fCurrency(totalPago)}</span></div>
        <div class="imp-stat"><b>${interacoes.length}</b><span>registros no histórico dos pacientes</span></div>
      </div>
      <ul class="imp-notes">
        ${periodo ? `<li>Período das vendas: <b>${fDate(periodo[0])}</b> a <b>${fDate(periodo[1])}</b> · total vendido ${fCurrency(totalComprado)}.</li>` : ''}
        <li>Status no funil: <b>${resumo.cliente}</b> clientes ativos (compraram nos últimos 90 dias), <b>${resumo.retorno}</b> para retorno (última compra há mais de 90 dias), <b>${resumo.inativo}</b> sem compras no período.</li>
        ${ex.pacientes || ex.vendas ? `<li>Deixados de fora (teste): ${ex.pacientes} cadastro(s) e ${ex.vendas} venda(s) · ${fCurrency(ex.pago)} pago.</li>` : ''}
        ${soNasVendas ? `<li>${soNasVendas} paciente(s) aparecem só nas vendas — serão cadastrados também.</li>` : ''}
        ${semPagamento ? `<li>${semPagamento} venda(s) com valor pago R$ 0,00 não viram entrada (ficam só no histórico).</li>` : ''}
        ${entradasJaExistem ? `<li>${entradasJaExistem} entrada(s) já estavam lançadas — não serão duplicadas.</li>` : ''}
        ${resumo.saldoAberto.length ? `<li>Saldo em aberto: ${resumo.saldoAberto.slice(0, 6).map(s => `${esc(s.nome)} (${fCurrency(s.saldo)})`).join(', ')}${resumo.saldoAberto.length > 6 ? '…' : ''} — anotado na ficha.</li>` : ''}
        <li>Procedimento e forma de pagamento não vêm na planilha: entram como <b>Outros</b> e <b>Não informado</b> (dá para editar cada entrada depois).</li>
      </ul>
      ${repetidas || ignorarRepetidas ? `<label class="imp-check"><input type="checkbox" id="impSkipDup" ${ignorarRepetidas ? 'checked' : ''} onchange="impBuildPlan()" /> Ignorar ${repetidas} linha(s) repetida(s) (mesmo paciente, mesmo horário e mesmo valor)</label>` : ''}
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="button" class="btn btn-primary" id="impRunBtn" onclick="impRun()" ${novos.length + atualizar.length + entradas.length + interacoes.length ? '' : 'disabled'}>${iconCheck()} Importar agora</button>
    </div>`;
}

/* ===== Grava (em lotes) ===== */
async function impInsertChunks(table, rows, label, btn) {
  for (let i = 0; i < rows.length; i += 200) {
    if (btn) btn.textContent = `Gravando ${label}… ${Math.min(i + 200, rows.length)}/${rows.length}`;
    const { error } = await db(table).insert(rows.slice(i, i + 200));
    if (error) throw new Error(`${label}: ${error.message || JSON.stringify(error)}`);
  }
}

async function impRun() {
  const plano = _imp.plano;
  if (!plano) return;
  const btn = document.getElementById('impRunBtn');
  if (btn) btn.disabled = true;
  try {
    await impInsertChunks('crm_pacientes', plano.novos, 'pacientes', btn);
    for (let i = 0; i < plano.atualizar.length; i++) {
      if (btn) btn.textContent = `Atualizando pacientes… ${i + 1}/${plano.atualizar.length}`;
      const a = plano.atualizar[i];
      const { error } = await db('crm_pacientes').update({ ...a.upd, updated_at: new Date().toISOString() }).eq('id', a.id);
      if (error) throw new Error('atualizar paciente: ' + (error.message || ''));
    }
    await impInsertChunks('entradas', plano.entradas, 'entradas', btn);
    await impInsertChunks('crm_interacoes', plano.interacoes, 'histórico', btn);
  } catch (e) {
    console.error('Importação:', e);
    toast('Erro na importação: ' + e.message + ' — o que já foi gravado fica salvo; importe de novo que ele continua sem duplicar.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Tentar de novo'; }
    await loadAllData();
    impBuildPlan();
    return;
  }
  toast(`Importado: ${plano.novos.length} pacientes, ${plano.entradas.length} entradas, ${plano.interacoes.length} registros de histórico.`, 'success');
  closeModal();
  await loadAllData();
  renderView(state.currentView);
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
}

const iconUpload = () => svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>');
