/* ============================================================
   ClinicFinance — iris-manual.js
   Íris: Manual dos procedimentos, Promoções e Configurações.
   Usa o estado _iris e os helpers de iris.js.
   ============================================================ */

/* ===== Manual padrão (rascunhos iniciais; a Dra. revisa e aprova) ===== */
const IRIS_RASCUNHO = ' (rascunho — a Dra. revisa)';
const IRIS_SEM_PRECO = 'O valor é definido na avaliação';
const irisItemPadrao = (chave, nome, oQueE, regras = {}) => ({
  chave, nome, o_que_e: oQueE + IRIS_RASCUNHO, indicacao: '', preparo: '', cuidados: '',
  informa_preco: false, preco_texto: IRIS_SEM_PRECO, duracao_min: null, agenda_direto: false,
  sinal_centavos: null, aprovado: false, ...regras
});
const IRIS_MANUAL_PADRAO = [
  irisItemPadrao('avaliacao', 'Avaliação', 'Consulta com a Dra. para conversar sobre o que a paciente deseja e examinar a pele e o rosto antes de qualquer procedimento.',
    { informa_preco: true, preco_texto: 'R$ 100', duracao_min: 30, agenda_direto: true, sinal_centavos: 10000 }),
  irisItemPadrao('botox', 'Botox', 'Aplicação de toxina botulínica, um procedimento injetável feito pela Dra. em áreas específicas do rosto.',
    { informa_preco: true, preco_texto: 'A partir de R$ 1.000, depende das áreas' }),
  irisItemPadrao('preenchimento_labial', 'Preenchimento labial', 'Procedimento injetável feito nos lábios com ácido hialurônico.'),
  irisItemPadrao('preenchimento_olheiras', 'Preenchimento de olheiras', 'Procedimento injetável feito na região das olheiras com ácido hialurônico.'),
  irisItemPadrao('fios_pdo', 'Fios de PDO', 'Procedimento em que a Dra. coloca fios de PDO sob a pele do rosto.'),
  irisItemPadrao('rinomodelacao', 'Rinomodelação', 'Procedimento injetável feito no nariz, sem cirurgia, com ácido hialurônico.'),
  irisItemPadrao('harmonizacao_facial', 'Harmonização facial', 'Conjunto de procedimentos no rosto, planejado pela Dra. na avaliação, que pode combinar técnicas diferentes.'),
  irisItemPadrao('bioestimulador', 'Bioestimulador', 'Procedimento injetável com bioestimulador de colágeno, aplicado pela Dra. nas áreas definidas na avaliação.'),
  irisItemPadrao('skinbooster', 'Skinbooster', 'Procedimento injetável que aplica ácido hialurônico em pequenas quantidades na pele.'),
  irisItemPadrao('microagulhamento', 'Microagulhamento', 'Procedimento feito na pele com um aparelho de microagulhas.'),
  irisItemPadrao('limpeza_de_pele', 'Limpeza de pele', 'Limpeza profunda da pele do rosto, feita no consultório.',
    { informa_preco: true, preco_texto: 'R$ 130', duracao_min: 60, agenda_direto: true, sinal_centavos: 6500 }),
  irisItemPadrao('peeling_quimico', 'Peeling químico', 'Procedimento em que a Dra. aplica um produto químico sobre a pele.'),
  irisItemPadrao('hialuronidase', 'Hialuronidase', 'Aplicação de hialuronidase, uma enzima usada para desfazer o ácido hialurônico de um preenchimento.'),
  irisItemPadrao('laser', 'Laser', 'Procedimento feito com um aparelho de laser aplicado sobre a pele.')
];

/* ===== Primeira abertura: cria a configuração e os itens que faltam (nunca sobrescreve) ===== */
let _irisPadrao = null; // { uid, p } — evita rodar duas vezes ao mesmo tempo
function irisGarantirPadrao() {
  const uid = currentUser?.id;
  if (_irisPadrao && _irisPadrao.uid === uid) return _irisPadrao.p;
  const p = irisCriarPadrao(uid).catch(e => {
    if (_irisPadrao && _irisPadrao.p === p) _irisPadrao = null; // permite "Tentar de novo"
    throw e;
  });
  _irisPadrao = { uid, p };
  return p;
}

const irisDuplicado = e => !!e && (e.code === '23505' || /duplicate key/i.test(e.message || ''));

async function irisCriarPadrao(uid) {
  const c = await db('iris_config').select('user_id').eq('user_id', uid).limit(1);
  if (c.error) throw c.error;
  if (!(c.data || []).length) {
    const r = await db('iris_config').insert({ user_id: uid }); // o banco preenche o resto
    if (r.error && !irisDuplicado(r.error)) throw r.error;
  }
  // se outra aba inseriu ao mesmo tempo, relê e tenta só o que ainda falta
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const m = await db('iris_manual').select('chave').eq('user_id', uid);
    if (m.error) throw m.error;
    const tem = new Set((m.data || []).map(r => r.chave));
    const faltam = IRIS_MANUAL_PADRAO
      .map((it, i) => ({ ...it, ordem: i, user_id: uid }))
      .filter(it => !tem.has(it.chave));
    if (!faltam.length) return;
    const r = await db('iris_manual').insert(faltam);
    if (!r.error) return;
    if (!irisDuplicado(r.error)) throw r.error;
  }
}

/* ===== Helpers ===== */
function irisHoje() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Recife' }); }
const irisNomeProc = chave => (_iris.manual.find(m => m.chave === chave) || IRIS_MANUAL_PADRAO.find(m => m.chave === chave) || {}).nome || chave || 'Procedimento';
const irisReais = c => fCurrency((c || 0) / 100);
// valor em reais para o campo do formulário: 10000 → "100"; 6550 → "65,50"
const irisReaisCampo = c => c == null ? '' : (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
// "65" / "65,50" / "1.000" / "R$ 100" → centavos; '' → null; inválido → undefined
function irisParseReais(s) {
  let t = String(s || '').replace(/R\$|\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  return Math.round(parseFloat(t) * 100);
}
function irisMarcar(campos, invalido) {
  campos.forEach(id => {
    const f = document.getElementById(id);
    if (f) invalido ? f.setAttribute('aria-invalid', 'true') : f.removeAttribute('aria-invalid');
  });
}
function irisErroCampo(errId, msg, campos = []) {
  const el = document.getElementById(errId);
  if (el) el.textContent = msg || '';
  irisMarcar(campos, !!msg);
  return !msg;
}
function irisOcupado(btn, ocupado, label) {
  if (!btn) return;
  if (ocupado) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.textContent = label || 'Salvando…'; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
function irisSwitch(id, label, on, extra = '') {
  return `<label class="iris-switch"><input type="checkbox" role="switch" id="${id}" ${on ? 'checked' : ''} ${extra} /><span class="iris-switch-track" aria-hidden="true"></span><span class="iris-switch-label">${label}</span></label>`;
}
const irisIconInfo = () => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

/* ===== Aba Manual ===== */
function irisRegraPreco(it) {
  return it.informa_preco && String(it.preco_texto || '').trim() ? it.preco_texto.trim() : 'Preço só na avaliação';
}
function irisRegraAgenda(it) {
  if (!it.agenda_direto) return 'Agendado pela clínica depois da avaliação';
  const partes = ['Agenda direto'];
  if (it.duracao_min) partes.push(`${it.duracao_min} min`);
  if (it.sinal_centavos != null) partes.push(`sinal de ${irisReais(it.sinal_centavos)}`);
  return partes.join(' · ');
}
function irisChip(aprovado) {
  return aprovado
    ? `<span class="badge badge-green iris-chip">${iconCheck()} Aprovado pela Dra.</span>`
    : `<span class="badge badge-gold iris-chip">Rascunho</span>`;
}

function irisTabManual() {
  const itens = _iris.manual;
  const aprovados = itens.filter(i => i.aprovado).length;
  return `
  <div class="iris-aviso" role="note">${irisIconInfo()}<span>A Íris só usa textos aprovados. O que não estiver aprovado ela passa para a Dra.</span></div>
  <div class="iris-head">
    <div><h2 class="iris-h2">Manual da Íris</h2><p class="iris-sub">O que a Íris pode dizer sobre cada procedimento. Abra um item para revisar e aprovar.</p></div>
    <span class="iris-count" aria-live="polite">${aprovados} de ${itens.length} aprovados</span>
  </div>
  ${itens.length ? `<div class="iris-grid">${itens.map(it => `
    <button type="button" class="iris-item ${it.aprovado ? 'is-ok' : ''}" onclick="irisAbrirItem('${esc(it.id)}')">
      <span class="iris-item-top"><span class="iris-item-nome">${esc(it.nome || it.chave)}</span>${irisChip(it.aprovado)}</span>
      <span class="iris-item-linha">${esc(irisRegraPreco(it))}</span>
      <span class="iris-item-meta">${esc(irisRegraAgenda(it))}</span>
    </button>`).join('')}</div>`
  : `<div class="iris-state iris-state--vazio"><p>Nenhum procedimento no Manual ainda.</p><button type="button" class="btn btn-secondary" onclick="irisCarregar()">Tentar de novo</button></div>`}`;
}

function irisAbrirItem(id) {
  const it = _iris.manual.find(x => x.id === id);
  if (!it) return;
  const area = (cid, label, valor, ph) => `
    <div class="form-group">
      <label class="form-label" for="${cid}">${label}</label>
      <textarea class="form-control" id="${cid}" rows="3" placeholder="${ph}">${esc(valor)}</textarea>
    </div>`;
  openModal(it.nome || 'Procedimento', `
  <form class="iris-form" onsubmit="irisSalvarItem(event, '${esc(it.id)}')" novalidate>
    <fieldset class="iris-fs">
      <legend class="iris-legend">O que a Íris pode explicar</legend>
      <p class="form-hint">Escreva como a Íris deve explicar para a paciente. Campo vazio, ela não fala do assunto.</p>
      <div class="form-grid iris-form-grid">
        ${area('irisMOque', 'O que é', it.o_que_e, 'Em poucas palavras, o que é o procedimento')}
        ${area('irisMIndic', 'Para quem é indicado', it.indicacao, 'Em termos gerais, sem prometer resultado')}
        ${area('irisMPrep', 'Preparo antes', it.preparo, 'O que a paciente faz antes de vir')}
        ${area('irisMCuid', 'Cuidados depois', it.cuidados, 'O que a paciente faz depois do procedimento')}
      </div>
    </fieldset>

    <fieldset class="iris-fs">
      <legend class="iris-legend">Preço</legend>
      ${irisSwitch('irisMInforma', 'A Íris pode informar o preço', it.informa_preco, 'onchange="irisItemCampos()"')}
      <div class="form-group">
        <label class="form-label" for="irisMPreco">Texto do preço</label>
        <input type="text" class="form-control" id="irisMPreco" value="${esc(it.preco_texto)}" placeholder="Ex.: R$ 130" aria-describedby="irisMPrecoHint irisMPrecoErro" />
        <p class="form-hint" id="irisMPrecoHint">Escreva o valor com R$. Com a opção desligada, a Íris diz que o valor é definido na avaliação.</p>
        <span class="iris-erro" id="irisMPrecoErro" role="alert"></span>
      </div>
    </fieldset>

    <fieldset class="iris-fs">
      <legend class="iris-legend">Agendamento</legend>
      ${irisSwitch('irisMDireto', 'Agenda direto, sem avaliação', it.agenda_direto, 'onchange="irisItemCampos()"')}
      <p class="form-hint iris-hint-off" id="irisMDiretoHint">Agendado pela clínica depois da avaliação</p>
      <div class="form-grid iris-form-grid">
        <div class="form-group">
          <label class="form-label" for="irisMDur">Tempo na agenda (min)</label>
          <input type="number" class="form-control" id="irisMDur" min="5" max="480" step="5" inputmode="numeric" value="${it.duracao_min ?? ''}" aria-describedby="irisMDurErro" />
          <span class="iris-erro" id="irisMDurErro" role="alert"></span>
        </div>
        <div class="form-group">
          <label class="form-label" for="irisMSinal">Sinal para reservar (R$)</label>
          <input type="text" class="form-control" id="irisMSinal" inputmode="decimal" value="${esc(irisReaisCampo(it.sinal_centavos))}" placeholder="Ex.: 65" aria-describedby="irisMSinalErro" />
          <span class="iris-erro" id="irisMSinalErro" role="alert"></span>
        </div>
      </div>
    </fieldset>

    <div class="iris-aprovar">
      ${irisSwitch('irisMAprov', 'Aprovado pela Dra.', it.aprovado)}
      <p class="form-hint">Ligado, a Íris passa a usar os textos deste item com as pacientes.</p>
    </div>

    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="submit" class="btn btn-primary" id="irisMSalvar">${iconCheck()} Salvar item</button>
    </div>
  </form>`, true);
  irisItemCampos();
}

// liga/desliga os campos que dependem dos interruptores
function irisItemCampos() {
  const informa = document.getElementById('irisMInforma')?.checked;
  const direto = document.getElementById('irisMDireto')?.checked;
  const preco = document.getElementById('irisMPreco');
  if (preco) preco.disabled = !informa;
  ['irisMDur', 'irisMSinal'].forEach(id => { const f = document.getElementById(id); if (f) f.disabled = !direto; });
  const hint = document.getElementById('irisMDiretoHint');
  if (hint) hint.hidden = !!direto;
}

async function irisSalvarItem(ev, id) {
  ev.preventDefault();
  const it = _iris.manual.find(x => x.id === id);
  if (!it) return;
  const val = cid => document.getElementById(cid)?.value ?? '';
  const informa = document.getElementById('irisMInforma').checked;
  const direto = document.getElementById('irisMDireto').checked;
  const precoTexto = val('irisMPreco').trim();
  const durTxt = val('irisMDur').trim();
  const dur = durTxt === '' ? null : Number(durTxt);
  const sinal = irisParseReais(val('irisMSinal'));

  let ok = true;
  let msgPreco = '';
  if (informa && !precoTexto) msgPreco = 'Escreva o preço ou desligue a opção acima.';
  else if (informa && /\d/.test(precoTexto) && !/R\$/.test(precoTexto)) msgPreco = 'Escreva o valor com R$ (ex.: R$ 130).';
  ok = irisErroCampo('irisMPrecoErro', msgPreco, ['irisMPreco']) && ok;
  ok = irisErroCampo('irisMDurErro', dur !== null && !(Number.isInteger(dur) && dur >= 5 && dur <= 480) ? 'Use minutos inteiros, de 5 a 480.' : '', ['irisMDur']) && ok;
  ok = irisErroCampo('irisMSinalErro', sinal === undefined ? 'Use só números, como 65 ou 65,50.' : '', ['irisMSinal']) && ok;
  if (!ok) return;

  const payload = {
    o_que_e: val('irisMOque').trim(), indicacao: val('irisMIndic').trim(),
    preparo: val('irisMPrep').trim(), cuidados: val('irisMCuid').trim(),
    informa_preco: informa, preco_texto: precoTexto,
    duracao_min: dur, agenda_direto: direto, sinal_centavos: sinal,
    aprovado: document.getElementById('irisMAprov').checked,
    updated_at: new Date().toISOString()
  };
  const btn = document.getElementById('irisMSalvar');
  irisOcupado(btn, true);
  const { error } = await db('iris_manual').update(payload).eq('id', id).eq('user_id', currentUser.id);
  if (error) {
    irisOcupado(btn, false);
    toast('Não foi possível salvar o item. Confira a internet e tente de novo.', 'error');
    return;
  }
  Object.assign(it, payload);
  closeModal();
  toast('Salvo');
  irisRenderBody();
}

/* ===== Aba Promoções ===== */
function irisTabPromocoes() {
  const hoje = irisHoje();
  const vigentes = _iris.promocoes.filter(p => p.valido_ate >= hoje).sort((a, b) => a.valido_ate.localeCompare(b.valido_ate));
  const vencidas = _iris.promocoes.filter(p => p.valido_ate < hoje).sort((a, b) => b.valido_ate.localeCompare(a.valido_ate));
  const linha = (p, vencida) => `
    <li class="iris-promo ${vencida ? 'is-vencida' : ''}">
      <div class="iris-promo-txt">
        <span class="iris-promo-proc">${esc(irisNomeProc(p.procedimento_chave))}</span>
        <span class="iris-promo-desc">${esc(p.descricao)}</span>
      </div>
      <div class="iris-promo-fim">
        ${vencida ? '<span class="badge badge-gray iris-chip">Vencida</span>' : ''}
        <span class="iris-promo-data">${vencida ? 'Valia até' : 'Válida até'} ${esc(fDate(p.valido_ate))}</span>
      </div>
      <button type="button" class="btn btn-danger btn-icon" title="Excluir" aria-label="Excluir promoção de ${esc(irisNomeProc(p.procedimento_chave))}" onclick="irisExcluirPromocao('${esc(p.id)}')">${iconTrash()}</button>
    </li>`;
  return `
  <div class="iris-head">
    <div><h2 class="iris-h2">Promoções</h2><p class="iris-sub">A Íris só fala das promoções cadastradas aqui, e só até a data de validade.</p></div>
    <button type="button" class="btn btn-primary" onclick="irisNovaPromocao()">${iconPlus()} Nova promoção</button>
  </div>
  ${_iris.promocoes.length ? `<ul class="iris-card iris-promos">${vigentes.map(p => linha(p, false)).join('')}${vencidas.map(p => linha(p, true)).join('')}</ul>`
  : `<div class="iris-state iris-state--vazio"><p>Nenhuma promoção cadastrada.</p><p class="iris-state-sub">Quando houver uma promoção, cadastre aqui para a Íris poder falar dela.</p></div>`}`;
}

function irisNovaPromocao() {
  const opcoes = (_iris.manual.length ? _iris.manual : IRIS_MANUAL_PADRAO)
    .map(m => `<option value="${esc(m.chave)}">${esc(m.nome || m.chave)}</option>`).join('');
  openModal('Nova promoção', `
  <form class="iris-form" onsubmit="irisSalvarPromocao(event)" novalidate>
    <div class="form-group">
      <label class="form-label" for="irisPProc">Procedimento</label>
      <select class="form-control" id="irisPProc" aria-describedby="irisPProcErro"><option value="">Escolha o procedimento</option>${opcoes}</select>
      <span class="iris-erro" id="irisPProcErro" role="alert"></span>
    </div>
    <div class="form-group">
      <label class="form-label" for="irisPDesc">Descrição</label>
      <textarea class="form-control" id="irisPDesc" rows="3" aria-describedby="irisPDescHint irisPDescErro"></textarea>
      <p class="form-hint" id="irisPDescHint">Escreva o valor com R$ (ex.: Limpeza de pele por R$ 99). A Íris só cita valores escritos aqui ou no Manual.</p>
      <span class="iris-erro" id="irisPDescErro" role="alert"></span>
    </div>
    <div class="form-group">
      <label class="form-label" for="irisPAte">Válida até</label>
      <input type="date" class="form-control" id="irisPAte" />
      <span class="iris-erro" id="irisPAteErro" role="alert"></span>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="submit" class="btn btn-primary" id="irisPSalvar">${iconCheck()} Salvar promoção</button>
    </div>
  </form>`);
}

async function irisSalvarPromocao(ev) {
  ev.preventDefault();
  const proc = document.getElementById('irisPProc').value;
  const desc = document.getElementById('irisPDesc').value.trim();
  const ate = document.getElementById('irisPAte')?.value || '';
  let ok = irisErroCampo('irisPProcErro', proc ? '' : 'Escolha o procedimento.', ['irisPProc']);
  ok = irisErroCampo('irisPDescErro', desc ? '' : 'Escreva a promoção.', ['irisPDesc']) && ok;
  ok = irisErroCampo('irisPAteErro', /^\d{4}-\d{2}-\d{2}$/.test(ate) ? '' : 'Escolha até quando vale.') && ok;
  if (!ok) return;
  const btn = document.getElementById('irisPSalvar');
  irisOcupado(btn, true);
  const uid = currentUser.id;
  const { error } = await db('iris_promocoes').insert({ user_id: uid, procedimento_chave: proc, descricao: desc, valido_ate: ate });
  if (error) {
    irisOcupado(btn, false);
    toast('Não foi possível salvar a promoção. Confira a internet e tente de novo.', 'error');
    return;
  }
  closeModal();
  toast('Salvo');
  const r = await db('iris_promocoes').select('*').eq('user_id', uid).order('valido_ate', { ascending: true });
  if (!r.error) _iris.promocoes = r.data || [];
  irisRenderBody();
}

async function irisExcluirPromocao(id) {
  if (!confirm('Excluir esta promoção? A Íris deixa de falar dela.')) return;
  const { error } = await db('iris_promocoes').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) { toast('Não foi possível excluir. Tente de novo.', 'error'); return; }
  _iris.promocoes = _iris.promocoes.filter(p => p.id !== id);
  toast('Promoção excluída');
  irisRenderBody();
}

/* ===== Aba Configurações ===== */
const IRIS_DIAS = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };
const IRIS_SEMANA_PADRAO = { 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '18:00'], 4: ['09:00', '18:00'], 5: ['09:00', '18:00'], 6: ['09:00', '12:00'] };
const IRIS_PRATICAS = [
  ['endereco', 'Endereço', 'Rua, número, bairro e cidade', ''],
  ['como_chegar', 'Como chegar', 'Ponto de referência, estacionamento…', ''],
  ['formas_pagamento', 'Formas de pagamento', 'Pix, cartão de crédito e débito…', ''],
  ['politica_cancelamento', 'Política de cancelamento', 'Com quanto tempo a paciente pode desmarcar e o que acontece com o sinal', ''],
  ['politica_atraso', 'Política de atraso', 'Quanto tempo de tolerância e o que acontece depois', ''],
  ['nunca_dizer', 'O que a Íris nunca deve dizer', 'Assuntos ou frases que a Íris deve evitar', ''],
  ['frase_emergencia', 'Frase para sinais graves', 'O que a Íris responde quando a paciente conta um sintoma grave depois de um procedimento', 'Precisa do aval da Dra.']
];

// lê o JSON do banco no formato do backend, com o padrão onde faltar
function irisHorarios(h) {
  h = h && typeof h === 'object' ? h : {};
  const semana = {};
  Object.keys(IRIS_DIAS).forEach(d => {
    const f = h.semana ? h.semana[d] : undefined;
    semana[d] = f === null ? null : (f && f.inicio && f.fim ? { inicio: f.inicio.slice(0, 5), fim: f.fim.slice(0, 5) } : { inicio: IRIS_SEMANA_PADRAO[d][0], fim: IRIS_SEMANA_PADRAO[d][1] });
  });
  const a = h.almoco && h.almoco.inicio && h.almoco.fim ? h.almoco : { inicio: '12:00', fim: '13:00' };
  const excecoes = Array.isArray(h.excecoes) ? h.excecoes.map(e => ({ ...e })) : [];
  return { semana, almoco: { inicio: a.inicio.slice(0, 5), fim: a.fim.slice(0, 5) }, excecoes };
}

const irisHora = (id, valor, label, off = false) => `<input type="time" step="1800" class="form-control iris-hora" id="${id}" value="${esc(valor)}" aria-label="${label}" aria-describedby="${id.replace(/[ifIF]$/, '')}Erro" ${off ? 'disabled' : ''} />`;

function irisTabConfig() {
  const c = _iris.config || {};
  const h = irisHorarios(c.horarios);
  _iris.excRascunho = h.excecoes;
  const modo = c.modo === 'automatico' ? 'automatico' : 'supervisionado';
  const radio = (v, titulo, desc) => `
    <label class="iris-modo">
      <input type="radio" name="irisModo" value="${v}" ${modo === v ? 'checked' : ''} onchange="irisSalvarModo(this.value)" />
      <span class="iris-modo-box"><span class="iris-modo-t">${titulo}</span><span class="iris-modo-d">${desc}</span></span>
    </label>`;
  const dia = d => {
    const f = h.semana[d], fechado = f === null, fx = f || { inicio: IRIS_SEMANA_PADRAO[d][0], fim: IRIS_SEMANA_PADRAO[d][1] };
    return `
    <div class="iris-dia ${fechado ? 'is-fechado' : ''}" id="irisD${d}">
      <span class="iris-dia-nome">${IRIS_DIAS[d]}</span>
      <div class="iris-faixa">${irisHora(`irisD${d}i`, fx.inicio, `${IRIS_DIAS[d]}, início`, fechado)}<span class="iris-as">às</span>${irisHora(`irisD${d}f`, fx.fim, `${IRIS_DIAS[d]}, fim`, fechado)}</div>
      ${irisSwitch(`irisD${d}x`, 'Fechado', fechado, `onchange="irisDiaFechado(${d})"`)}
      <span class="iris-erro" id="irisD${d}Erro" role="alert"></span>
    </div>`;
  };
  return `
  <section class="iris-card" aria-labelledby="irisModoT">
    <h2 class="iris-h2" id="irisModoT">Modo de atendimento</h2>
    <p class="iris-sub">A mudança vale assim que você escolhe.</p>
    <div class="iris-modos" role="radiogroup" aria-labelledby="irisModoT">
      ${radio('supervisionado', 'Supervisionado', 'A Rosi aprova cada resposta no expediente')}
      ${radio('automatico', 'Automático', 'A Íris responde sozinha')}
    </div>
    <p class="form-hint iris-nota">Fora do expediente a Íris responde sozinha nos dois modos, e a Rosi revisa depois.</p>
  </section>

  <section class="iris-card" aria-labelledby="irisHorT">
    <h2 class="iris-h2" id="irisHorT">Horários de atendimento</h2>
    <p class="iris-sub">A Íris só oferece horários dentro destes intervalos. Domingo fica fechado.</p>
    <div class="iris-dias">
      ${Object.keys(IRIS_DIAS).map(dia).join('')}
      <div class="iris-dia iris-dia--almoco">
        <span class="iris-dia-nome">Almoço</span>
        <div class="iris-faixa">${irisHora('irisAlmI', h.almoco.inicio, 'Almoço, início')}<span class="iris-as">às</span>${irisHora('irisAlmF', h.almoco.fim, 'Almoço, fim')}</div>
        <span class="iris-dia-nota">Sempre livre na agenda</span>
        <span class="iris-erro" id="irisAlmErro" role="alert"></span>
      </div>
    </div>

    <h3 class="iris-h3">Dias diferentes</h3>
    <p class="iris-sub">Para abrir um horário a mais ou bloquear horários numa data específica.</p>
    <div id="irisExcecoes">${irisExcecoesHTML()}</div>
    <button type="button" class="btn btn-secondary iris-add" onclick="irisAddExcecao()">${iconPlus()} Adicionar dia</button>

    <div class="iris-acoes"><button type="button" class="btn btn-primary" id="irisHSalvar" onclick="irisSalvarHorarios()">${iconCheck()} Salvar horários</button></div>
  </section>

  <section class="iris-card" aria-labelledby="irisInfoT">
    <h2 class="iris-h2" id="irisInfoT">Informações práticas</h2>
    <p class="iris-sub">A Íris usa estas informações quando a paciente pergunta. Campo vazio, ela diz que vai confirmar com a equipe.</p>
    <div class="form-grid iris-form-grid">
      ${IRIS_PRATICAS.map(([k, label, ph, nota]) => `
      <div class="form-group ${k === 'endereco' || k === 'nunca_dizer' || k === 'frase_emergencia' ? 'form-full' : ''}">
        <label class="form-label" for="irisI_${k}">${label}${nota ? ` <span class="badge badge-gold iris-chip iris-chip--nota">${nota}</span>` : ''}</label>
        ${k === 'endereco'
          ? `<input type="text" class="form-control" id="irisI_${k}" value="${esc(c[k])}" placeholder="${ph}" />`
          : `<textarea class="form-control" id="irisI_${k}" rows="3" placeholder="${ph}">${esc(c[k])}</textarea>`}
      </div>`).join('')}
    </div>
    <div class="iris-acoes"><button type="button" class="btn btn-primary" id="irisISalvar" onclick="irisSalvarInfos()">${iconCheck()} Salvar informações</button></div>
  </section>`;
}

function irisExcecoesHTML() {
  const ex = _iris.excRascunho || [];
  if (!ex.length) return `<p class="iris-vazio-linha">Nenhuma data diferente cadastrada.</p>`;
  return ex.map((e, i) => `
    <div class="iris-exc">
      <div class="iris-exc-data"><input type="date" class="form-control" id="irisE${i}d" value="${esc(e.data)}" aria-label="Data" /></div>
      <select class="form-control iris-exc-tipo" id="irisE${i}t" aria-label="Tipo">
        <option value="extra" ${e.tipo !== 'bloqueio' ? 'selected' : ''}>Horário extra</option>
        <option value="bloqueio" ${e.tipo === 'bloqueio' ? 'selected' : ''}>Bloqueio</option>
      </select>
      <div class="iris-faixa">${irisHora(`irisE${i}i`, e.inicio, 'Início')}<span class="iris-as">às</span>${irisHora(`irisE${i}f`, e.fim, 'Fim')}</div>
      <button type="button" class="btn btn-danger btn-icon" title="Remover" aria-label="Remover esta data" onclick="irisRemoverExcecao(${i})">${iconTrash()}</button>
      <span class="iris-erro" id="irisE${i}Erro" role="alert"></span>
    </div>`).join('');
}

// guarda o que está na tela antes de redesenhar a lista
function irisLerExcecoes() {
  _iris.excRascunho = (_iris.excRascunho || []).map((e, i) => ({
    data: document.getElementById(`irisE${i}d`)?.value || '',
    tipo: document.getElementById(`irisE${i}t`)?.value === 'bloqueio' ? 'bloqueio' : 'extra',
    inicio: (document.getElementById(`irisE${i}i`)?.value || '').slice(0, 5),
    fim: (document.getElementById(`irisE${i}f`)?.value || '').slice(0, 5)
  }));
}
function irisRedesenharExcecoes() {
  const el = document.getElementById('irisExcecoes');
  if (el) el.innerHTML = irisExcecoesHTML();
  setTimeout(initDatePickers, 10);
}
function irisAddExcecao() {
  irisLerExcecoes();
  _iris.excRascunho.push({ data: '', tipo: 'extra', inicio: '18:00', fim: '19:00' });
  irisRedesenharExcecoes();
}
function irisRemoverExcecao(i) {
  irisLerExcecoes();
  _iris.excRascunho.splice(i, 1);
  irisRedesenharExcecoes();
}
function irisDiaFechado(d) {
  const fechado = document.getElementById(`irisD${d}x`).checked;
  document.getElementById(`irisD${d}`)?.classList.toggle('is-fechado', fechado);
  [`irisD${d}i`, `irisD${d}f`].forEach(id => { const f = document.getElementById(id); if (f) f.disabled = fechado; });
  if (fechado) irisErroCampo(`irisD${d}Erro`, '', [`irisD${d}i`, `irisD${d}f`]);
}

async function irisSalvarConfig(payload) {
  const { error } = await db('iris_config').update({ ...payload, updated_at: new Date().toISOString() }).eq('user_id', currentUser.id);
  if (!error) _iris.config = { ...(_iris.config || {}), ...payload };
  return !error;
}

async function irisSalvarModo(modo) {
  if (modo !== 'supervisionado' && modo !== 'automatico') return;
  const anterior = _iris.config?.modo === 'automatico' ? 'automatico' : 'supervisionado';
  if (await irisSalvarConfig({ modo })) { toast('Salvo'); return; }
  toast('Não foi possível mudar o modo. Confira a internet e tente de novo.', 'error');
  const r = document.querySelector(`input[name="irisModo"][value="${anterior}"]`);
  if (r) r.checked = true;
}

async function irisSalvarHorarios() {
  const hora = id => (document.getElementById(id)?.value || '').slice(0, 5);
  const faixaOk = (i, f) => /^\d{2}:\d{2}$/.test(i) && /^\d{2}:\d{2}$/.test(f) && f > i;
  const msgFaixa = (i, f) => (!i || !f) ? 'Preencha início e fim.' : 'O fim precisa ser depois do início.';
  let ok = true;
  const semana = {};
  Object.keys(IRIS_DIAS).forEach(d => {
    const fechado = document.getElementById(`irisD${d}x`).checked;
    const i = hora(`irisD${d}i`), f = hora(`irisD${d}f`);
    const bom = fechado || faixaOk(i, f);
    ok = irisErroCampo(`irisD${d}Erro`, bom ? '' : msgFaixa(i, f), [`irisD${d}i`, `irisD${d}f`]) && ok;
    semana[d] = fechado ? null : { inicio: i, fim: f };
  });
  const ai = hora('irisAlmI'), af = hora('irisAlmF');
  ok = irisErroCampo('irisAlmErro', faixaOk(ai, af) ? '' : msgFaixa(ai, af), ['irisAlmI', 'irisAlmF']) && ok;
  irisLerExcecoes();
  _iris.excRascunho.forEach((e, i) => {
    const semData = !/^\d{4}-\d{2}-\d{2}$/.test(e.data), horaRuim = !faixaOk(e.inicio, e.fim);
    irisMarcar([`irisE${i}d_display`, `irisE${i}d`], semData);
    irisMarcar([`irisE${i}i`, `irisE${i}f`], horaRuim);
    const msg = semData ? 'Escolha a data.' : (horaRuim ? msgFaixa(e.inicio, e.fim) : '');
    ok = irisErroCampo(`irisE${i}Erro`, msg) && ok;
  });
  if (!ok) { toast('Confira os horários marcados em vermelho.', 'error'); return; }

  const horarios = {
    semana,
    almoco: { inicio: ai, fim: af },
    excecoes: _iris.excRascunho.map(e => ({ data: e.data, tipo: e.tipo, inicio: e.inicio, fim: e.fim })).sort((a, b) => a.data.localeCompare(b.data))
  };
  const btn = document.getElementById('irisHSalvar');
  irisOcupado(btn, true);
  const salvo = await irisSalvarConfig({ horarios });
  irisOcupado(btn, false);
  if (!salvo) { toast('Não foi possível salvar os horários. Confira a internet e tente de novo.', 'error'); return; }
  _iris.excRascunho = horarios.excecoes;
  irisRedesenharExcecoes();
  toast('Salvo');
}

async function irisSalvarInfos() {
  const payload = {};
  IRIS_PRATICAS.forEach(([k]) => { payload[k] = (document.getElementById(`irisI_${k}`)?.value || '').trim(); });
  const btn = document.getElementById('irisISalvar');
  irisOcupado(btn, true);
  const salvo = await irisSalvarConfig(payload);
  irisOcupado(btn, false);
  if (!salvo) { toast('Não foi possível salvar as informações. Confira a internet e tente de novo.', 'error'); return; }
  toast('Salvo');
}
