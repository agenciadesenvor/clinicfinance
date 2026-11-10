/* ============================================================
   ClinicFinance — iris-acoes.js
   Íris: o que a equipe faz na aba Conversas (aprovar, editar e
   assumir respostas, responder pendências) e o Simulador (a equipe
   escreve como se fosse a paciente e vê a Íris responder).
   A renderização da conversa fica em iris-conversas.js.
   Tabelas: iris_conversas, iris_mensagens, iris_pendencias (ver iris.sql)
   ============================================================ */

/* ===== Estado ===== */
const _irisAcoes = {
  ocupado: new Set(),     // chaves das ações em andamento (ignora clique duplo)
  editando: null,         // id da conversa com o rascunho aberto para edição
  erroEdicao: '',
  pensando: new Set(),    // conversas com a Íris respondendo agora
  simPendente: {},        // conversa → texto enviado como paciente, ainda sem retorno
  simStatus: {},          // conversa → linha de aviso abaixo do celular
  simVista: 'celular',    // coluna da direita no simulador: 'celular' | 'resumo'
  folha: false            // celular aberto como folha (telas menores)
};
const IRIS_CLINICA = 'Dra. Patrícia Nascimento';
const IRIS_SIM_AVISO = 'Aqui você escreve como se fosse a paciente. Nada deste teste vai para o CRM, a Agenda ou o financeiro.';
const IRIS_DESFECHOS = {
  respondida: '',
  rascunho: 'A Íris escreveu um rascunho. Aprove na conversa ao lado para a paciente receber.',
  equipe: 'A conversa está com a equipe, então a Íris não respondeu.',
  enfileirada: 'A Íris ainda está respondendo a mensagem anterior.',
  bloqueada: 'A Íris não conseguiu responder. Veja a nota na conversa.',
  horario_perdido: 'O horário já estava ocupado. Veja a conversa.',
  inexistente: 'Essa reserva não existe mais.'
};
// aviso abaixo do celular; o do rascunho e o da equipe somem quando deixam de valer
function irisSimAviso(c) {
  const k = _irisAcoes.simStatus[c.id] || '';
  if (k === 'rascunho' && !irisRascunhosDe(c).length) return '';
  if (k === 'equipe' && c.estado !== 'equipe') return '';
  return IRIS_DESFECHOS[k] || '';
}

const irisAgoraIso = () => new Date().toISOString();
const irisUid = () => currentUser.id;
const irisRascunhosDe = c => (c?.mensagens || []).filter(m => m.status === 'rascunho');

/* ===== Ajudante: gravar, mostrar ocupado, avisar erro, recarregar ===== */
// passos: funções que devolvem { error } (db) e rodam em ordem; para no primeiro erro.
// Se nada foi gravado, a tela não muda; se algo foi gravado antes do erro, recarrega para mostrar o real.
// aoGravar roda logo depois de tudo gravado (antes de recarregar); depois roda no fim.
async function irisAcao(chave, passos, { erro = 'Não foi possível salvar. Confira a internet e tente de novo.', aoGravar, depois } = {}) {
  if (_irisAcoes.ocupado.has(chave)) return false;
  _irisAcoes.ocupado.add(chave);
  irisRenderConversa();
  let feitos = 0, ok = true;
  try {
    for (const passo of passos) {
      const r = await passo();
      if (r && r.error) throw r.error;
      feitos++;
    }
  } catch (e) {
    ok = false;
    console.error('Íris: erro na ação', chave, e);
    toast(erro, 'error');
  }
  _irisAcoes.ocupado.delete(chave);
  if (ok && aoGravar) aoGravar();
  if (ok || feitos) await irisRecarregar();
  else irisRenderConversa();
  if (ok && depois) await depois();
  return ok;
}

// conversa aberta na tela (as ações sempre agem sobre ela)
function irisConversaAtual() {
  const c = irisAberta();
  if (!c) toast('Abra a conversa de novo e tente outra vez.', 'error');
  return c;
}

const irisDescartarRascunhos = id => () =>
  db('iris_mensagens').update({ status: 'descartada' }).eq('conversa_id', id).eq('status', 'rascunho');
const irisAtualizarConversa = (id, dados) => () => db('iris_conversas').update(dados).eq('id', id);

/* ===== Rascunho da Íris ===== */
function irisEnviarRascunho() {
  const c = irisConversaAtual();
  if (!c || !irisRascunhosDe(c).length) return;
  return irisAcao(`rascunho:${c.id}`, [
    () => db('iris_mensagens').update({ status: 'enviada' }).eq('conversa_id', c.id).eq('status', 'rascunho')
  ], { erro: 'Não foi possível enviar o rascunho. Confira a internet e tente de novo.' });
}

function irisEditarRascunho() {
  const c = irisConversaAtual();
  if (!c) return;
  const rascunhos = irisRascunhosDe(c);
  if (!rascunhos.length) return;
  _irisAcoes.editando = c.id;
  _irisAcoes.erroEdicao = '';
  _irisConv.campos[`edit:${c.id}`] = rascunhos.map(m => String(m.texto || '')).join('\n\n');
  irisRenderConversa();
  const campo = document.getElementById('irisEdicao');
  if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
}

function irisCancelarEdicao() {
  const id = _irisAcoes.editando;
  _irisAcoes.editando = null;
  _irisAcoes.erroEdicao = '';
  if (id) delete _irisConv.campos[`edit:${id}`];
  irisRenderConversa();
}

// parágrafo i → rascunho i (mantém o meta, com editada: true); rascunhos a mais → descartados;
// parágrafos a mais → novas mensagens da Íris, depois das atualizações
async function irisEnviarEdicao() {
  const c = irisConversaAtual();
  if (!c || _irisAcoes.editando !== c.id) return;
  const partes = String(_irisConv.campos[`edit:${c.id}`] || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  if (!partes.length) {
    _irisAcoes.erroEdicao = 'Escreva a mensagem antes de enviar.';
    irisRenderConversa();
    document.getElementById('irisEdicao')?.focus();
    return;
  }
  _irisAcoes.erroEdicao = '';
  const linhas = irisRascunhosDe(c);
  const passos = linhas.map((m, i) => i < partes.length
    ? () => db('iris_mensagens').update({ texto: partes[i], status: 'enviada', meta: { ...(m.meta && typeof m.meta === 'object' ? m.meta : {}), editada: true } })
      .eq('id', m.id).eq('status', 'rascunho')
    : () => db('iris_mensagens').update({ status: 'descartada' }).eq('id', m.id).eq('status', 'rascunho'));
  const extras = partes.slice(linhas.length);
  if (extras.length) {
    // horário explícito e crescente (como o backend), sempre depois do último rascunho
    const ultimo = linhas[linhas.length - 1];
    const base = Math.max(Date.now(), (Date.parse(ultimo?.created_at) || 0) + 1);
    passos.push(() => db('iris_mensagens').insert(extras.map((texto, i) => ({
      user_id: irisUid(), conversa_id: c.id, autor: 'iris', texto, status: 'enviada',
      meta: { editada: true }, created_at: new Date(base + i).toISOString()
    }))));
  }
  await irisAcao(`rascunho:${c.id}`, passos, {
    erro: 'Não foi possível enviar a mensagem editada. Confira a internet e tente de novo.',
    aoGravar: () => { _irisAcoes.editando = null; delete _irisConv.campos[`edit:${c.id}`]; }
  });
}

function irisEuRespondo() {
  const c = irisConversaAtual();
  if (!c) return;
  return irisAcao(`rascunho:${c.id}`, [
    irisDescartarRascunhos(c.id),
    irisAtualizarConversa(c.id, { estado: 'equipe', equipe_desde: irisAgoraIso() })
  ], { erro: 'Não foi possível passar a conversa para você. Confira a internet e tente de novo.', depois: () => document.getElementById('irisEscrever')?.focus() });
}

/* ===== Quem atende ===== */
function irisAssumir() {
  const c = irisConversaAtual();
  if (!c) return;
  return irisAcao(`estado:${c.id}`, [irisAtualizarConversa(c.id, { estado: 'equipe', equipe_desde: irisAgoraIso() })],
    { erro: 'Não foi possível assumir a conversa. Confira a internet e tente de novo.' });
}

function irisDevolver() {
  const c = irisConversaAtual();
  if (!c) return;
  const semResposta = irisNaoRespondidas(c.mensagens).length > 0;
  return irisAcao(`estado:${c.id}`, [irisAtualizarConversa(c.id, { estado: 'iris', equipe_desde: null })], {
    erro: 'Não foi possível devolver a conversa para a Íris. Confira a internet e tente de novo.',
    depois: semResposta ? () => irisChamarChat(c.id) : null
  });
}

// campo da equipe: Enter envia, Shift+Enter quebra a linha
function irisEnterEnvia(ev) {
  if (ev.key !== 'Enter' || ev.shiftKey || ev.isComposing) return;
  ev.preventDefault();
  ev.target.form?.requestSubmit();
}

async function irisEscrever(ev) {
  ev?.preventDefault();
  const c = irisConversaAtual();
  if (!c) return;
  const chave = `escrever:${c.id}`;
  const texto = String(_irisConv.campos[chave] || '').trim();
  if (!texto) return;
  const agora = irisAgoraIso();
  const ok = await irisAcao(chave, [
    () => db('iris_mensagens').insert({ user_id: irisUid(), conversa_id: c.id, autor: 'equipe', status: 'enviada', texto }),
    irisDescartarRascunhos(c.id),
    irisAtualizarConversa(c.id, { estado: 'equipe', equipe_desde: agora, ultima_em: agora })
  ], { erro: 'Não foi possível enviar a mensagem. Confira a internet e tente de novo.', aoGravar: () => irisLimparCampo(chave), depois: () => document.getElementById('irisEscrever')?.focus() });
  return ok;
}

// limpa o campo só depois de gravar (se falhar, o texto continua lá)
function irisLimparCampo(chave) {
  delete _irisConv.campos[chave];
  document.querySelectorAll('[data-campo]').forEach(el => { if (el.dataset.campo === chave) el.value = ''; });
}

/* ===== Pendências (o que a Íris passou para a Dra.) ===== */
async function irisResponderPendencia(id) {
  const c = irisConversaAtual();
  const p = (c?.pendencias || []).find(x => x.id === id);
  if (!c || !p) return;
  const chave = `pend:${id}`;
  const texto = String(_irisConv.campos[chave] || '').trim();
  if (!texto) {
    [...document.querySelectorAll('.iris-pend-resposta')].find(x => x.dataset.id === id)?.focus();
    return;
  }
  const agora = irisAgoraIso();
  // não muda o estado: a Íris segue com o resto do atendimento
  await irisAcao(chave, [
    () => db('iris_mensagens').insert({ user_id: irisUid(), conversa_id: c.id, autor: 'equipe', status: 'enviada', texto }),
    () => db('iris_pendencias').update({ status: 'resolvida', resolvida_em: agora }).eq('id', id),
    irisAtualizarConversa(c.id, { ultima_em: agora })
  ], { erro: 'Não foi possível enviar a resposta. Confira a internet e tente de novo.', aoGravar: () => irisLimparCampo(chave) });
}

function irisResolverPendencia(id) {
  const c = irisConversaAtual();
  if (!c || !(c.pendencias || []).some(x => x.id === id)) return;
  return irisAcao(`pend:${id}`, [
    () => db('iris_pendencias').update({ status: 'resolvida', resolvida_em: irisAgoraIso() }).eq('id', id)
  ], { erro: 'Não foi possível marcar como resolvido. Confira a internet e tente de novo.' });
}

/* ===== Faixas: fora do expediente e "Íris não respondeu" ===== */
function irisMarcarRevisada() {
  const c = irisConversaAtual();
  if (!c) return;
  return irisAcao(`revisada:${c.id}`, [
    () => db('iris_mensagens').update({ revisada: true }).eq('conversa_id', c.id).eq('fora_expediente', true)
  ], { erro: 'Não foi possível marcar como revisada. Confira a internet e tente de novo.' });
}

function irisPedirNovaTentativa() {
  const c = irisConversaAtual();
  if (c) return irisChamarChat(c.id);
}

/* ===== Chamada à Íris (iris-chat) ===== */
// Mostra "digitando…" no celular enquanto a função responde; depois recarrega e deixa o aviso do desfecho.
// aoVoltar roda quando a função responde (antes de recarregar), com ou sem erro.
async function irisChamarChat(conversaId, texto, aoVoltar) {
  if (_irisAcoes.pensando.has(conversaId)) return { erro: true, ocupado: true };
  _irisAcoes.pensando.add(conversaId);
  irisRenderConversa();
  const corpo = texto === undefined ? { conversa_id: conversaId } : { conversa_id: conversaId, texto };
  const r = await irisChamar('iris-chat', corpo);
  _irisAcoes.pensando.delete(conversaId);
  if (aoVoltar) aoVoltar(r);
  if (!r || r.erro) { irisRenderConversa(); return { erro: true }; }
  const desfecho = r.desfecho;
  _irisAcoes.simStatus[conversaId] = desfecho in IRIS_DESFECHOS ? desfecho : '';
  await irisRecarregar();
  if (desfecho === 'enfileirada') {
    setTimeout(async () => { // uma vez só; depois o aviso deixa de valer
      if (_irisAcoes.simStatus[conversaId] === 'enfileirada') _irisAcoes.simStatus[conversaId] = '';
      await irisRecarregar();
    }, 6000);
  }
  return r;
}

/* ===== Simulador ===== */
function irisNovaConversaTeste() {
  openModal('Nova conversa de teste', `
  <form class="iris-form" onsubmit="irisCriarConversaTeste(event)" novalidate>
    <p class="iris-sim-aviso iris-sim-aviso--modal">${esc(IRIS_SIM_AVISO)}</p>
    <div class="form-group">
      <label class="form-label" for="irisTNome">Nome da paciente (fictício)</label>
      <input type="text" class="form-control" id="irisTNome" placeholder="Ex.: Camila" maxlength="80" autocomplete="off" aria-describedby="irisTNomeErro" />
      <span class="iris-erro" id="irisTNomeErro" role="alert"></span>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
      <button type="submit" class="btn btn-primary" id="irisTCriar">Começar o teste</button>
    </div>
  </form>`);
  setTimeout(() => document.getElementById('irisTNome')?.focus(), 30);
}

async function irisCriarConversaTeste(ev) {
  ev.preventDefault();
  const btn = document.getElementById('irisTCriar');
  if (!btn || btn.disabled) return;
  const nome = String(document.getElementById('irisTNome')?.value || '').trim();
  if (!irisErroCampo('irisTNomeErro', nome ? '' : 'Escreva um nome para a paciente do teste.', ['irisTNome'])) return;
  irisOcupado(btn, true, 'Criando…');
  const id = crypto.randomUUID(); // o insert não devolve a linha
  const { error } = await db('iris_conversas').insert({ id, user_id: irisUid(), canal: 'simulador', contato_nome: nome });
  if (error) {
    irisOcupado(btn, false);
    toast('Não foi possível criar a conversa de teste. Confira a internet e tente de novo.', 'error');
    return;
  }
  closeModal();
  _irisConv.aberta = id;
  _irisConv.filtro = 'todas';
  _irisAcoes.simVista = 'celular';
  _irisAcoes.folha = window.matchMedia('(max-width: 1279px)').matches; // telas menores: já abre o celular
  await irisRecarregar();
  document.getElementById('irisSimCampo')?.focus();
}

function irisSimVista(v) {
  if (!['celular', 'resumo'].includes(v)) return;
  _irisAcoes.simVista = v;
  irisRenderConversa();
}

function irisAbrirCelular() {
  _irisAcoes.folha = true;
  irisRenderConversa();
  document.getElementById('irisSimCampo')?.focus();
}

function irisFecharCelular() {
  if (!_irisAcoes.folha) return;
  _irisAcoes.folha = false;
  irisRenderConversa();
  document.getElementById('irisBtnAbrirCel')?.focus();
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && _irisAcoes.folha) irisFecharCelular(); });

// a paciente escreve: a bolha aparece na hora como "enviando…", a Íris "digita" e o campo espera
async function irisSimEnviar(ev) {
  ev?.preventDefault();
  const c = irisConversaAtual();
  if (!c || c.canal !== 'simulador') return;
  const chave = `sim:${c.id}`;
  const texto = String(_irisConv.campos[chave] || '').trim();
  if (!texto || _irisAcoes.simPendente[c.id] !== undefined || _irisAcoes.pensando.has(c.id)) return;
  _irisAcoes.simPendente[c.id] = texto;
  _irisAcoes.simStatus[c.id] = '';
  delete _irisConv.campos[chave];
  const r = await irisChamarChat(c.id, texto, resp => {
    if (resp && !resp.erro) return;
    // erro: tira a bolha e devolve o texto ao campo, para não perder o que foi escrito
    delete _irisAcoes.simPendente[c.id];
    if (!String(_irisConv.campos[chave] || '').trim()) _irisConv.campos[chave] = texto;
  });
  if (!r.erro) { // a bolha "enviando…" sai só depois que a mensagem gravada já está na tela
    delete _irisAcoes.simPendente[c.id];
    irisRenderConversa();
  }
  if (irisAberta()?.id === c.id) document.getElementById('irisSimCampo')?.focus();
}

async function irisSimPagar(reservaId) {
  const c = irisConversaAtual();
  if (!c || !(c.reservas || []).some(r => r.id === reservaId)) return;
  const chave = `pagar:${reservaId}`;
  if (_irisAcoes.ocupado.has(chave)) return;
  _irisAcoes.ocupado.add(chave);
  _irisAcoes.simStatus[c.id] = '';
  irisRenderConversa();
  const r = await irisChamar('iris-pagamento', { reserva_id: reservaId, simulado: true });
  _irisAcoes.ocupado.delete(chave);
  if (!r || r.erro) { irisRenderConversa(); return; }
  _irisAcoes.simStatus[c.id] = ['horario_perdido', 'inexistente'].includes(r.resultado) ? r.resultado : '';
  await irisRecarregar();
}

async function irisExcluirTeste(id) {
  const c = _irisConv.lista.find(x => x.id === id);
  if (!c || c.canal !== 'simulador') return;
  const chave = `excluir:${id}`;
  if (_irisAcoes.ocupado.has(chave)) return;
  if (!confirm('Excluir esta conversa de teste? As mensagens dela são apagadas.')) return;
  _irisAcoes.ocupado.add(chave);
  // mensagens, pendências e reservas caem junto (cascata no banco)
  const { error } = await db('iris_conversas').delete().eq('id', id).eq('canal', 'simulador');
  _irisAcoes.ocupado.delete(chave);
  if (error) {
    toast('Não foi possível excluir a conversa de teste. Confira a internet e tente de novo.', 'error');
    irisRenderConversa();
    return;
  }
  if (_irisConv.aberta === id) _irisConv.aberta = null;
  _irisAcoes.folha = false;
  if (_irisAcoes.editando === id) _irisAcoes.editando = null;
  delete _irisAcoes.simStatus[id];
  Object.keys(_irisConv.campos).forEach(k => { if (k.endsWith(`:${id}`)) delete _irisConv.campos[k]; });
  toast('Conversa de teste excluída');
  await irisRecarregar();
}

/* ===== Simulador: coluna da direita (celular da paciente · resumo) ===== */
function irisHtmlColunaSim(c) {
  const vista = _irisAcoes.simVista;
  const botao = (v, label) => `<button type="button" class="iris-sim-troca-btn ${vista === v ? 'is-on' : ''}" data-vista="${v}" aria-pressed="${vista === v}" onclick="irisSimVista(this.dataset.vista)">${label}</button>`;
  return `<div class="iris-sim" data-vista="${vista}">
    <div class="iris-sim-troca" role="group" aria-label="O que mostrar ao lado da conversa">${botao('celular', 'Celular da paciente')}${botao('resumo', 'Resumo')}</div>
    <div class="iris-sim-folha-topo">
      <span class="iris-sim-folha-t">Celular da paciente</span>
      <button type="button" class="btn btn-secondary iris-sim-fechar" onclick="irisFecharCelular()">Fechar</button>
    </div>
    <div class="iris-sim-vista-cel">${irisHtmlCelular(c)}</div>
    <div class="iris-sim-vista-resumo">${irisHtmlResumo(c)}</div>
  </div>`;
}

function irisHtmlCelular(c) {
  const msgs = (c.mensagens || []).filter(m => m.status === 'enviada' && ['paciente', 'iris', 'equipe'].includes(m.autor));
  const pendente = _irisAcoes.simPendente[c.id];
  const pensando = _irisAcoes.pensando.has(c.id);
  const ocupado = pendente !== undefined || pensando;
  const ativa = irisReservaAtiva(c.reservas, Date.now());
  const pagando = ativa && _irisAcoes.ocupado.has(`pagar:${ativa.id}`);
  const status = irisSimAviso(c);
  const bolha = m => {
    const lado = m.autor === 'paciente' ? 'eu' : 'clinica';
    return `<div class="iris-cel-msg iris-cel-msg--${lado}"><div class="iris-cel-bolha">${esc(m.texto)}<time>${esc(irisHoraDe(Date.parse(m.created_at)))}</time></div></div>`;
  };
  return `<p class="iris-sim-aviso">${esc(IRIS_SIM_AVISO)}</p>
    <div class="iris-cel" aria-label="Celular da paciente (simulação)">
      <div class="iris-cel-topo">
        <span class="iris-cel-avatar" aria-hidden="true">P</span>
        <span class="iris-cel-quem"><strong>${esc(IRIS_CLINICA)}</strong><small>${pensando ? 'digitando…' : 'WhatsApp · simulação'}</small></span>
      </div>
      <div class="iris-cel-msgs" id="irisCelMsgs" role="log" aria-label="Mensagens que a paciente vê">
        ${msgs.length || pendente !== undefined ? '' : '<p class="iris-cel-vazio">Escreva abaixo a primeira mensagem da paciente.</p>'}
        ${msgs.map(bolha).join('')}
        ${pendente !== undefined ? `<div class="iris-cel-msg iris-cel-msg--eu is-enviando"><div class="iris-cel-bolha">${esc(pendente)}<time>enviando…</time></div></div>` : ''}
        ${pensando ? `<div class="iris-cel-msg iris-cel-msg--clinica"><div class="iris-cel-bolha iris-cel-digitando" role="status"><span class="iris-cel-pontos" aria-hidden="true"><i></i><i></i><i></i></span>digitando…</div></div>` : ''}
      </div>
      ${ativa ? `<div class="iris-cel-pagar">
        <button type="button" class="btn btn-secondary" data-id="${esc(ativa.id)}" onclick="irisSimPagar(this.dataset.id)" ${pagando ? 'disabled aria-busy="true"' : ''}>${pagando ? 'Confirmando pagamento…' : 'Simular pagamento aprovado'}</button>
      </div>` : ''}
      <form class="iris-cel-campo" id="irisSimForm" onsubmit="event.preventDefault(); irisSimEnviar(event)">
        <textarea class="iris-cel-texto" id="irisSimCampo" rows="1" data-campo="sim:${esc(c.id)}" placeholder="Escrever como paciente…" aria-label="Escrever como paciente" oninput="irisGuardarCampo(this)" onkeydown="irisEnterEnvia(event)" ${ocupado ? 'disabled' : ''}>${esc(_irisConv.campos[`sim:${c.id}`] || '')}</textarea>
        <button type="submit" class="iris-cel-enviar" aria-label="Enviar como paciente" ${ocupado ? 'disabled' : ''}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.99.99 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>
        </button>
      </form>
    </div>
    <p class="iris-sim-status" role="status" aria-live="polite">${esc(status)}</p>`;
}
