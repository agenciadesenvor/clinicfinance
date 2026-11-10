/* ============================================================
   ClinicFinance — iris-conversas.js
   Íris: aba Conversas (caixa de entrada da equipe). Só lê os dados;
   as ações (enviar rascunho, escrever, resolver) chegam na etapa seguinte.
   Tabelas: iris_conversas, iris_mensagens, iris_pendencias, iris_reservas (ver iris.sql)
   ============================================================ */

/* ===== Estado ===== */
const _irisConv = { status: 'inicial', erro: '', lista: [], filtro: 'mim', busca: '', aberta: null, carga: null };

const IRIS_FILTROS = [
  ['mim', 'Precisa de mim'],
  ['iris', 'Íris atendendo'],
  ['dra', 'Aguardando Dra.'],
  ['fora', 'Fora do expediente'],
  ['todas', 'Todas']
];
const IRIS_MOTIVOS = {
  duvida_clinica: 'Dúvida clínica', desconto: 'Desconto', insatisfeita: 'Paciente insatisfeita',
  outro_profissional: 'Feito com outro profissional', fora_do_manual: 'Fora do Manual', cancelamento: 'Cancelamento',
  foto_para_avaliar: 'Foto para avaliar', pagamento_apos_prazo: 'Pagou depois do prazo'
};
const IRIS_TZ = 'America/Recife';
const IRIS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const IRIS_MIN = 60000;

/* ===== Regras (funções puras) ===== */
// Mensagens da paciente ainda sem resposta (espelho de `pendentes` no backend, atendimento.ts).
// Corte: mensagem enviada da equipe cobre até ela mesma; resposta enviada da Íris cobre até a
// mensagem do seu `meta.cobre_ate` (ou até ela mesma, se esse id não está na lista). Nunca recua.
function irisNaoRespondidas(msgs) {
  const lista = msgs || [];
  let corte = -1;
  lista.forEach((m, i) => {
    if (m.status !== 'enviada') return;
    if (m.autor === 'equipe') corte = Math.max(corte, i);
    const alvo = m.meta ? m.meta.cobre_ate : undefined;
    if (m.autor === 'iris' && alvo !== undefined) {
      const j = lista.findIndex(x => x.id === alvo);
      corte = Math.max(corte, j >= 0 ? j : i);
    }
  });
  return lista.filter((m, i) => i > corte && m.autor === 'paciente' && m.status === 'enviada');
}

// A Íris travou: a mensagem mais nova (fora rascunhos e descartadas) é a nota de bloqueio,
// ou há mensagem da paciente sem resposta, sem rascunho, há mais de 3 minutos.
function irisNaoRespondeu(msgs, agora) {
  const enviadas = msgs.filter(m => m.status === 'enviada');
  const ultima = enviadas[enviadas.length - 1];
  if (ultima && ultima.autor === 'sistema' && String(ultima.texto || '').startsWith('A Íris não conseguiu')) return true;
  if (msgs.some(m => m.status === 'rascunho')) return false;
  const pend = irisNaoRespondidas(msgs);
  const nova = pend[pend.length - 1];
  return !!nova && agora - Date.parse(nova.created_at) > 3 * IRIS_MIN;
}

// Situação da conversa para a etiqueta e os filtros; a primeira regra que bate vence.
// conversa: linha de iris_conversas com { mensagens, pendencias, reservas } já agrupados.
function irisSituacao(conversa, agora = Date.now()) {
  const msgs = conversa.mensagens || [];
  const abertas = (conversa.pendencias || []).filter(p => p.status === 'aberta');
  const reservas = conversa.reservas || [];
  if (abertas.some(p => p.urgente)) return { chave: 'urgente', rotulo: '🚨 Urgente · Dra. avisada' };
  if (msgs.some(m => m.status === 'rascunho')) return { chave: 'rascunho', rotulo: 'Rascunho para aprovar' };
  if (conversa.estado === 'equipe') return { chave: 'equipe', rotulo: 'Com a equipe' };
  if (irisNaoRespondeu(msgs, agora)) return { chave: 'atencao', rotulo: 'Íris não respondeu' };
  if (abertas.length) return { chave: 'dra', rotulo: 'Aguardando Dra.' };
  const ativa = irisReservaAtiva(reservas, agora);
  if (ativa) return { chave: 'pagamento', rotulo: `⏳ Aguardando pagamento · ${irisMinutosRestantes(ativa, agora)} min` };
  if (reservas.some(r => r.status === 'paga')) return { chave: 'pago', rotulo: '✅ Agendou · pago' };
  return { chave: 'iris', rotulo: 'Íris atendendo' };
}

function irisReservaAtiva(reservas, agora) {
  const ativas = (reservas || []).filter(r => r.status === 'ativa' && Date.parse(r.expira_em) > agora);
  return ativas.sort((a, b) => Date.parse(b.expira_em) - Date.parse(a.expira_em))[0] || null;
}
const irisMinutosRestantes = (r, agora) => Math.max(1, Math.ceil((Date.parse(r.expira_em) - agora) / IRIS_MIN));
const irisForaPendente = c => (c.mensagens || []).some(m => m.autor === 'iris' && m.status === 'enviada' && m.fora_expediente === true && !m.revisada);

function irisNoFiltro(c, sit, filtro) {
  if (filtro === 'mim') return ['urgente', 'rascunho', 'equipe', 'atencao'].includes(sit.chave);
  if (filtro === 'iris') return ['iris', 'pagamento', 'pago'].includes(sit.chave);
  if (filtro === 'dra') return (c.pendencias || []).some(p => p.status === 'aberta');
  if (filtro === 'fora') return irisForaPendente(c);
  return true;
}

/* ===== Datas e textos ===== */
const irisDia = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: IRIS_TZ }); // YYYY-MM-DD
const irisHoraDe = ms => new Date(ms).toLocaleTimeString('pt-BR', { timeZone: IRIS_TZ, hour: '2-digit', minute: '2-digit' });
const irisDdMm = dia => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// "agora", "5 min", "2 h", "ontem", "03/11"
function irisTempoRel(iso, agora = Date.now()) {
  const t = Date.parse(iso);
  if (!t) return '';
  const diff = agora - t;
  if (diff < IRIS_MIN) return 'agora';
  if (diff < 60 * IRIS_MIN) return `${Math.floor(diff / IRIS_MIN)} min`;
  const dia = irisDia(t);
  if (dia === irisDia(agora)) return `${Math.floor(diff / (60 * IRIS_MIN))} h`;
  if (dia === irisDia(agora - 1440 * IRIS_MIN)) return 'ontem';
  return irisDdMm(dia);
}
// hora da mensagem: "14:32" hoje, "09/11, 14:32" antes
function irisHoraMsg(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const dia = irisDia(t);
  return dia === irisDia(Date.now()) ? irisHoraDe(t) : `${irisDdMm(dia)}, ${irisHoraDe(t)}`;
}
// mesmo formato do backend (rotuloSlot): "sexta, 13/11, às 9h" / "…às 10h30"
function irisRotuloSlot(data, hora) {
  const d = String(data || ''), h = String(hora || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(d) || !/^\d{2}:\d{2}/.test(h)) return 'horário a confirmar';
  const dia = IRIS_SEMANA[new Date(`${d.slice(0, 10)}T12:00:00Z`).getUTCDay()];
  const mm = h.slice(3, 5);
  return `${dia}, ${d.slice(8, 10)}/${d.slice(5, 7)}, às ${h.slice(0, 2).replace(/^0/, '')}h${mm === '00' ? '' : mm}`;
}
const irisNomeConversa = c => String(c.contato_nome || '').trim() || 'Paciente sem nome';
const irisSemAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const irisMotivo = m => IRIS_MOTIVOS[m] || 'Para a Dra.';
const irisProc = p => ({ avaliacao: 'Avaliação', limpeza_de_pele: 'Limpeza de pele' })[p] || (typeof irisNomeProc === 'function' ? irisNomeProc(p) : p || 'Procedimento');
const irisAberta = () => _irisConv.lista.find(c => c.id === _irisConv.aberta) || null;

/* ===== Carga ===== */
function irisLoadConversas() {
  if (_irisConv.carga) return _irisConv.carga;
  _irisConv.carga = irisBuscarConversas().finally(() => { _irisConv.carga = null; });
  return _irisConv.carga;
}

async function irisBuscarConversas() {
  if (typeof currentUser === 'undefined' || !currentUser) {
    _irisConv.status = 'erro';
    _irisConv.erro = 'Faça login para ver a Íris.';
    irisRenderInbox();
    return;
  }
  if (!_irisConv.lista.length) { _irisConv.status = 'carregando'; irisRenderInbox(); }
  try {
    const uid = currentUser.id;
    const [c, m, p, r] = await Promise.all([
      db('iris_conversas').select('*').eq('user_id', uid).order('ultima_em', { ascending: false }),
      // as mais novas primeiro, para o limite cortar as antigas; a ordem da conversa é refeita abaixo
      db('iris_mensagens').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(3000),
      db('iris_pendencias').select('*').eq('user_id', uid).eq('status', 'aberta'),
      db('iris_reservas').select('*').eq('user_id', uid)
    ]);
    const erro = c.error || m.error || p.error || r.error;
    if (erro) throw erro;
    const grupo = (linhas, id) => linhas.filter(x => x.conversa_id === id);
    const msgs = (m.data || []).slice().sort((a, b) =>
      (Date.parse(a.created_at) - Date.parse(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    _irisConv.lista = (c.data || []).map(conv => ({
      ...conv,
      mensagens: grupo(msgs, conv.id),
      pendencias: grupo(p.data || [], conv.id),
      reservas: grupo(r.data || [], conv.id)
    }));
    if (_irisConv.aberta && !irisAberta()) _irisConv.aberta = null;
    _irisConv.status = 'pronto';
  } catch (e) {
    console.error('Íris: erro ao carregar conversas', e);
    if (!_irisConv.lista.length) {
      _irisConv.status = 'erro';
      _irisConv.erro = irisMsgErro(e);
    } else {
      toast('Não foi possível atualizar as conversas. Confira a internet e tente de novo.', 'error');
    }
  }
  irisRenderInbox();
}

// recarrega mantendo filtro, busca e a conversa aberta
function irisRecarregar() { return irisLoadConversas(); }

/* ===== Entrada da aba (chamada por irisRenderBody) ===== */
// irisRenderBody chama uma vez por abertura da aba: mostra o que já há e busca dados frescos
function irisTabConversas(el) {
  if (_irisConv.lista.length) irisRenderInbox();
  else el.innerHTML = irisCarregando();
  irisLoadConversas();
}

/* ===== Renderização ===== */
function irisRenderInbox() {
  const el = document.getElementById('irisBody');
  if (!el || _iris.tab !== 'conversas' || state.currentView !== 'iris') return;
  if (_irisConv.status === 'erro' && !_irisConv.lista.length) { el.innerHTML = irisErroConversas(_irisConv.erro); return; }
  if (!_irisConv.lista.length) {
    el.innerHTML = _irisConv.status === 'pronto' ? irisHtmlSemConversas() : irisCarregando();
    return;
  }
  if (!document.getElementById('irisInbox')) el.innerHTML = irisHtmlInbox();
  irisRenderLista();
  irisRenderConversa();
}

function irisErroConversas(msg) {
  return `<div class="iris-state iris-state--erro" role="alert">
    <h3>Não foi possível abrir as conversas</h3>
    <p>${esc(msg)}</p>
    <button type="button" class="btn btn-secondary" onclick="irisRecarregar()">Tentar de novo</button>
  </div>`;
}

function irisHtmlSemConversas() {
  return `<div class="iris-state iris-state--vazio">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    <p>Nenhuma conversa ainda. Crie uma conversa de teste para ver a Íris atendendo.</p>
    <button type="button" class="btn btn-primary" id="irisBtnNovaTeste" disabled>Nova conversa de teste</button>
  </div>`;
}

function irisHtmlInbox() {
  return `
  <div class="iris-inbox" id="irisInbox">
    <aside class="iris-col iris-col-lista" aria-label="Conversas">
      <div class="iris-lista-topo">
        <div class="iris-busca-linha">
          <label class="iris-busca">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input type="search" id="irisBusca" placeholder="Buscar paciente…" aria-label="Buscar paciente pelo nome" autocomplete="off" value="${esc(_irisConv.busca)}" oninput="irisBuscar(this.value)" />
          </label>
          <button type="button" class="iris-atualizar" id="irisBtnAtualizar" onclick="irisRecarregar()" title="Buscar mensagens novas">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-2.64-6.36"/><path d="M21 3v6h-6"/></svg><span class="iris-atualizar-txt">Atualizar</span>
          </button>
        </div>
        <div class="iris-filtros" id="irisFiltros" role="group" aria-label="Filtrar conversas"></div>
      </div>
      <ul class="iris-lista" id="irisLista" aria-label="Lista de conversas"></ul>
    </aside>
    <section class="iris-col iris-col-conversa" id="irisConversa" aria-label="Conversa"></section>
    <aside class="iris-col iris-col-resumo" id="irisResumo" aria-label="Resumo da paciente"></aside>
  </div>`;
}

function irisRenderLista() {
  const fEl = document.getElementById('irisFiltros'), lEl = document.getElementById('irisLista');
  if (!fEl || !lEl) return;
  // a lista é refeita: guarda o foco do teclado (item ou filtro) para devolvê-lo depois
  const foco = document.activeElement;
  const focoItem = foco?.classList.contains('iris-ci') ? foco.dataset.id : null;
  const focoFiltro = foco?.classList.contains('iris-filtro') ? foco.dataset.filtro : null;
  const agora = Date.now();
  const itens = _irisConv.lista.map(c => ({ c, sit: irisSituacao(c, agora) }));
  fEl.innerHTML = IRIS_FILTROS.map(([k, label]) => {
    const n = itens.filter(({ c, sit }) => irisNoFiltro(c, sit, k)).length;
    const on = _irisConv.filtro === k;
    return `<button type="button" class="iris-filtro ${on ? 'is-on' : ''} ${k === 'mim' && n ? 'is-alerta' : ''}" data-filtro="${k}" aria-pressed="${on}" onclick="irisSetFiltro(this.dataset.filtro)">${label}<span class="iris-filtro-n" data-n="${n}">${n}</span></button>`;
  }).join('');
  const q = irisSemAcento(_irisConv.busca.trim());
  const visiveis = itens.filter(({ c, sit }) => irisNoFiltro(c, sit, _irisConv.filtro) && (!q || irisSemAcento(irisNomeConversa(c)).includes(q)));
  lEl.innerHTML = visiveis.length
    ? visiveis.map(({ c, sit }) => irisHtmlItem(c, sit, agora)).join('')
    : `<li class="iris-lista-vazia">Nada aqui agora.</li>`;
  if (focoItem) [...lEl.querySelectorAll('.iris-ci')].find(b => b.dataset.id === focoItem)?.focus({ preventScroll: true });
  if (focoFiltro) [...fEl.querySelectorAll('.iris-filtro')].find(b => b.dataset.filtro === focoFiltro)?.focus({ preventScroll: true });
}

function irisTrecho(c) {
  const ms = (c.mensagens || []).filter(m => m.status === 'enviada' && m.autor !== 'sistema');
  const m = ms[ms.length - 1];
  if (!m) return 'Sem mensagens ainda';
  const prefixo = m.autor === 'iris' ? 'Íris: ' : m.autor === 'equipe' ? 'Equipe: ' : '';
  return prefixo + String(m.texto || '').replace(/\s+/g, ' ').trim();
}

function irisHtmlItem(c, sit, agora) {
  const aberta = c.id === _irisConv.aberta;
  return `<li><button type="button" class="iris-ci iris-ci--${sit.chave} ${aberta ? 'is-aberta' : ''}" data-id="${esc(c.id)}" ${aberta ? 'aria-current="true"' : ''} onclick="irisAbrir(this.dataset.id)">
    <span class="iris-ci-linha">
      <span class="iris-ci-nome">${esc(irisNomeConversa(c))}</span>
      ${c.canal === 'simulador' ? '<span class="iris-teste">Teste</span>' : ''}
      <span class="iris-ci-tempo">${esc(irisTempoRel(c.ultima_em, agora))}</span>
    </span>
    <span class="iris-ci-trecho">${esc(irisTrecho(c))}</span>
    ${irisHtmlSituacao(sit)}
  </button></li>`;
}

const irisHtmlSituacao = sit => `<span class="iris-sit iris-sit--${sit.chave}">${esc(sit.rotulo)}</span>`;

function irisRenderConversa() {
  const inbox = document.getElementById('irisInbox');
  const cEl = document.getElementById('irisConversa'), rEl = document.getElementById('irisResumo');
  if (!inbox || !cEl || !rEl) return;
  const c = irisAberta();
  inbox.classList.toggle('is-aberta', !!c);
  if (!c) {
    cEl.removeAttribute('data-id');
    cEl.innerHTML = `<div class="iris-conv-nada">Escolha uma conversa à esquerda.</div>`;
    rEl.innerHTML = '';
    return;
  }
  cEl.dataset.id = c.id;
  const sit = irisSituacao(c);
  cEl.innerHTML = `
    <header class="iris-conv-topo">
      <button type="button" class="iris-voltar" id="irisBtnVoltar" onclick="irisVoltar()">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>Voltar
      </button>
      <div class="iris-conv-titulo">
        <h2 class="iris-conv-nome" id="irisConvNome" tabindex="-1">${esc(irisNomeConversa(c))}</h2>
        ${c.canal === 'simulador' ? '<span class="iris-teste">Teste</span>' : ''}
        ${irisHtmlSituacao(sit)}
      </div>
      ${c.contato_telefone ? `<div class="iris-conv-tel">${esc(c.contato_telefone)}</div>` : ''}
      <details class="iris-resumo-movel"><summary>Resumo da paciente</summary>${irisHtmlResumo(c)}</details>
    </header>
    ${irisHtmlPendencias(c)}
    <div class="iris-thread" id="irisThread" role="log" aria-label="Mensagens">
      ${irisHtmlThread(c)}
      ${irisHtmlRascunho(c)}
    </div>
    ${irisHtmlComposer()}`;
  rEl.innerHTML = irisHtmlResumo(c);
  const t = document.getElementById('irisThread');
  if (t) t.scrollTop = t.scrollHeight;
}

function irisHtmlPendencias(c) {
  const abertas = (c.pendencias || []).filter(p => p.status === 'aberta');
  if (!abertas.length) return '';
  return `<div class="iris-pends">${abertas.map(p => `
    <div class="iris-pend ${p.urgente ? 'iris-pend--urgente' : ''}" data-id="${esc(p.id)}">
      <div class="iris-pend-motivo">${p.urgente ? '🚨 Urgente · ' : 'Aguardando Dra. · '}${esc(irisMotivo(p.motivo))}</div>
      ${p.resumo ? `<p class="iris-pend-resumo">${esc(p.resumo)}</p>` : ''}
      <form class="iris-pend-form" data-id="${esc(p.id)}" onsubmit="event.preventDefault()">
        <input type="text" class="form-control iris-pend-resposta" data-id="${esc(p.id)}" placeholder="Responder à paciente…" aria-label="Responder à paciente" disabled />
        <button type="button" class="btn btn-secondary iris-pend-resolver" data-id="${esc(p.id)}" disabled>Marcar como resolvido</button>
      </form>
    </div>`).join('')}</div>`;
}

function irisHtmlThread(c) {
  const msgs = (c.mensagens || []).filter(m => m.status === 'enviada');
  if (!msgs.length) return `<p class="iris-thread-vazia">Nenhuma mensagem ainda.</p>`;
  return msgs.map(irisHtmlMensagem).join('');
}

function irisHtmlMensagem(m) {
  const hora = esc(irisHoraMsg(m.created_at));
  if (m.autor === 'sistema') {
    return `<div class="iris-nota-sis"><span>${esc(m.texto)}</span><time>${hora}</time></div>`;
  }
  const quem = m.autor === 'iris' ? (m.fora_expediente ? 'Íris · fora do expediente' : 'Íris · enviada')
    : m.autor === 'equipe' ? 'Equipe' : '';
  const lado = m.autor === 'paciente' ? 'paciente' : m.autor === 'equipe' ? 'equipe' : 'iris';
  return `<div class="iris-msg iris-msg--${lado}">
    <div class="iris-bolha">${esc(m.texto)}</div>
    <div class="iris-msg-info">${quem ? `${quem} · ` : ''}${hora}</div>
  </div>`;
}

function irisHtmlRascunho(c) {
  const rascunhos = (c.mensagens || []).filter(m => m.status === 'rascunho');
  if (!rascunhos.length) return '';
  return `<div class="iris-rascunho" id="irisRascunho" data-id="${esc(c.id)}">
    <div class="iris-rascunho-titulo">Rascunho da Íris · aguardando sua aprovação</div>
    ${rascunhos.map(m => `<p class="iris-rascunho-texto" data-id="${esc(m.id)}">${esc(m.texto)}</p>`).join('')}
    <div class="iris-rascunho-acoes">
      <button type="button" class="btn btn-primary" id="irisBtnEnviarRascunho" disabled>Enviar</button>
      <button type="button" class="btn btn-secondary" id="irisBtnEditarRascunho" disabled>Editar</button>
      <button type="button" class="btn btn-secondary" id="irisBtnEuRespondo" disabled>Eu respondo</button>
    </div>
  </div>`;
}

function irisHtmlComposer() {
  return `<form class="iris-composer" id="irisComposer" onsubmit="event.preventDefault()">
    <textarea class="form-control iris-composer-campo" id="irisEscrever" rows="1" placeholder="Escrever como equipe (pausa a Íris nesta conversa)…" aria-label="Escrever como equipe (pausa a Íris nesta conversa)" disabled></textarea>
    <button type="submit" class="btn btn-primary" id="irisBtnEscrever" disabled>Enviar</button>
  </form>`;
}

function irisHtmlResumo(c) {
  const q = c.qualificacao || {};
  const linha = (label, v) => `<div class="iris-res-linha"><dt>${label}</dt><dd>${String(v || '').trim() ? esc(v) : '—'}</dd></div>`;
  const agora = Date.now();
  const ativa = irisReservaAtiva(c.reservas, agora);
  const paga = (c.reservas || []).filter(r => r.status === 'paga').sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  let agenda = `<p class="iris-res-vazio">Nenhum horário reservado ainda</p>`;
  if (ativa) {
    agenda = `<div class="iris-res-agenda iris-res-agenda--ativa">
      <div class="iris-res-agenda-t">⏳ Horário segurado · faltam ${irisMinutosRestantes(ativa, agora)} min</div>
      <div>${esc(irisProc(ativa.procedimento))}, ${esc(irisRotuloSlot(ativa.data, ativa.hora_inicio))}</div>
      <div class="iris-res-agenda-sub">Aguardando o sinal de ${esc(irisReais(ativa.valor_centavos))}</div>
    </div>`;
  } else if (paga) {
    agenda = `<div class="iris-res-agenda iris-res-agenda--paga">
      <div class="iris-res-agenda-t">✅ Agendado e pago</div>
      <div>${esc(irisProc(paga.procedimento))}, ${esc(irisRotuloSlot(paga.data, paga.hora_inicio))}</div>
      <div class="iris-res-agenda-sub">Sinal de ${esc(irisReais(paga.valor_centavos))} pago</div>
    </div>`;
  }
  const abertas = (c.pendencias || []).filter(p => p.status === 'aberta');
  return `<div class="iris-resumo">
    <section class="iris-res-sec">
      <h3 class="iris-res-h">Qualificação</h3>
      <dl class="iris-res-dl">
        ${linha('Quer melhorar', q.quer_melhorar)}${linha('Já fez antes', q.ja_fez)}${linha('Momento', q.momento)}${linha('Origem', q.origem)}
      </dl>
    </section>
    <section class="iris-res-sec">
      <h3 class="iris-res-h">Agenda e pagamento</h3>
      ${agenda}
    </section>
    <section class="iris-res-sec">
      <h3 class="iris-res-h">Pendências</h3>
      ${abertas.length ? `<ul class="iris-res-pends">${abertas.map(p => `
        <li class="${p.urgente ? 'is-urgente' : ''}"><strong>${p.urgente ? '🚨 ' : ''}${esc(irisMotivo(p.motivo))}</strong>${p.resumo ? `<span>${esc(p.resumo)}</span>` : ''}</li>`).join('')}</ul>`
        : `<p class="iris-res-vazio">Nenhuma</p>`}
    </section>
  </div>`;
}

/* ===== Interação ===== */
function irisSetFiltro(f) {
  if (!IRIS_FILTROS.some(([k]) => k === f)) return;
  _irisConv.filtro = f;
  irisRenderLista();
}

function irisBuscar(q) {
  _irisConv.busca = String(q || '');
  irisRenderLista();
}

function irisAbrir(id) {
  if (!_irisConv.lista.some(c => c.id === id)) return;
  _irisConv.aberta = id;
  irisRenderLista();
  irisRenderConversa();
  // no celular a conversa substitui a lista: leva o foco e a página para o topo dela
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.getElementById('irisConversa')?.scrollIntoView({ block: 'start' });
    document.getElementById('irisConvNome')?.focus({ preventScroll: true });
  }
}

function irisVoltar() {
  const id = _irisConv.aberta;
  _irisConv.aberta = null;
  irisRenderLista();
  irisRenderConversa();
  const item = [...document.querySelectorAll('#irisLista .iris-ci')].find(b => b.dataset.id === id);
  item?.focus();
}
