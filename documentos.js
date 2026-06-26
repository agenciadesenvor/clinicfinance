/* ============================================================
   ClinicFinance — documentos.js
   Abas: Ficha de Anamnese · Receituário · Receituário de Exames
   Geração de PDF (jsPDF) com a identidade da Dra Patrícia Nascimento.
   ============================================================ */

/* ===== DADOS DA MARCA (cabeçalho/rodapé do PDF) ===== */
const CLINIC_DOC = {
  name:       'Dra Patrícia Nascimento',
  role:       'ESTÉTICA AVANÇADA',
  profession: 'BIOMÉDICA',
  crbm:       'CRBM: 16449',
  address:    'Rua Tomé de Souza, nº 02, Bairro Bela Vista',
  addressSub: '(Na mesma rua da JCL Lages, antes do sinal da construção)',
  cep:        'CEP: 55194-405',
  phone:      '(81) 9 8407-3876',
  instagram:  'drapatricianascimentof',
  note:       'Prescrição biomédica regulamentada pela resolução Nº 348, de 16 de Junho de 2022.',
  disclaimer: 'Conforme RDC 44 de 17/08/2009 da ANVISA: Este procedimento não tem finalidade de diagnóstico e não substitui a consulta médica ou a realização de exames laboratoriais.'
};

/* Emblema da marca (SVG) — rasterizado para PNG e usado como logo + marca-d'água */
const CLINIC_EMBLEM_SVG = `<svg width="908" height="1072" viewBox="0 0 908 1072" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M809.715 401.459C810.289 426.977 802.458 454.109 787.683 477.7C749.465 537.224 673.657 578.104 594.56 581.906C581.247 582.271 569.761 581.333 559.214 579.042L559.423 576.959C624.059 575.605 697.674 540.661 743.096 489.834C773.43 456.036 784.916 413.437 775.257 369.796C767.895 329.124 740.224 283.453 686.188 288.712C612.364 296.264 574.721 374.952 564.958 398.855C551.54 429.425 545.118 466.555 539.479 499.156L539.271 500.197C538.122 506.394 536.869 512.696 535.72 519.101C521.467 595.029 505.387 681.009 452.707 740.22C428.482 767.144 393.606 785.683 356.851 791.047L355.911 786.829C379.458 779.955 399.976 769.175 416.892 755.114C472.912 707.724 488.158 629.4 500.374 566.491C504.865 541.546 508.728 518.372 512.33 495.614C512.8 492.177 513.375 488.74 513.949 485.303C517.029 464.577 520.371 443.277 527.053 423.123C539.897 381.462 567.464 340.112 600.878 312.616C627.974 290.066 671.465 266.111 723.726 279.964C777.45 296.316 807.783 353.392 809.82 401.355" fill="#7F6658"/>
<path d="M609.967 284.445C586.42 291.528 565.902 302.203 548.882 316.264C492.966 363.654 477.721 441.874 465.399 504.887C460.909 529.832 457.15 553.006 453.548 575.764C452.973 579.201 452.503 582.638 451.929 586.075C448.692 606.802 445.403 628.101 438.72 648.255C425.877 689.917 398.31 731.266 365 758.867C337.799 781.312 294.413 805.267 242.152 791.363C188.324 775.011 158.095 717.934 156.059 670.075C155.38 644.401 163.159 617.269 178.091 593.678C216.204 534.154 292.116 493.274 371.213 489.472H376.852C387.764 489.472 397.527 490.358 406.455 492.337L406.246 494.42C341.715 495.774 267.995 530.717 222.573 581.701C192.396 615.395 180.91 657.994 190.412 701.478C197.304 740.067 222.573 783.135 271.128 783.135C273.895 783.135 276.61 782.926 279.638 782.666C353.358 775.115 391.105 696.426 400.868 672.523C414.286 641.954 420.708 604.875 426.346 572.223L426.451 571.181C427.704 564.984 428.853 558.579 430.001 552.277C444.254 476.349 460.439 390.37 513.118 331.158C537.344 304.13 572.22 285.695 608.975 280.331L609.915 284.445H609.967Z" fill="#7F6658"/>
<path d="M484.133 0H481.627C363.843 1.71854 267.412 57.9617 196.46 140.972L202.203 162.272C250.183 99.9879 313.356 51.0875 392.193 26.4551C422.161 17.1854 452.703 13.0713 482.88 13.3838C513.162 13.0193 543.704 17.1854 573.672 26.4551C783.867 92.1763 882.595 329.908 881.603 534.987V536.341C882.648 741.42 783.92 979.256 573.672 1045.03C543.704 1054.3 513.162 1058.41 482.88 1058.1C452.703 1058.47 422.161 1054.3 392.193 1045.03C181.998 979.308 83.113 741.472 84.2616 536.341V534.987C83.8961 468.329 94.1292 398.129 115.274 331.626L110.575 314.233C109.061 308.608 106.19 303.713 102.326 299.703C72.2535 375.631 56.8517 457.601 58.0003 535.039V536.393C54.5545 779.176 212.54 1067.53 481.627 1071.54H484.133C753.221 1067.53 911.206 779.176 907.865 536.393V535.039C911.206 292.256 753.221 4.00993 484.133 0Z" fill="#7F6658"/>
<path d="M315.71 243.823L222.464 268.924C203.199 274.079 188.163 289.078 182.994 308.294L157.829 401.304L132.664 308.294C131.515 304.076 129.793 299.91 127.704 296.16C123.788 288.817 118.306 282.516 111.519 277.621C106.142 273.611 99.9288 270.642 93.1415 268.924L0 243.823L93.246 218.722C112.511 213.566 127.548 198.568 132.716 179.351L157.881 86.3418L178.661 163.051L183.046 179.299C183.62 181.486 184.299 183.517 185.239 185.496C191.556 201.744 205.444 214.139 222.569 218.722L315.815 243.823H315.71Z" fill="#7F6658"/>
</svg>`;

/* ===== Listas ===== */
const EXAM_LIST = [
  'Hemograma', 'Glicose em jejum', 'Lipidograma', 'HbA1c', 'Insulina',
  'TGO', 'TGP', 'Cálcio', 'Transferrina', 'Ferro', 'Ferritina',
  'Vitamina B2', 'Vitamina D', 'Zinco sérico', 'Selênio sérico', 'Magnésio',
  'Potássio', 'TSH', 'T3 e T4 livre', 'Cortisol basal',
  'Testosterona total e livre', 'SHBG', 'FSH e LH', 'DHEA-S', 'DHEA', 'Androstenediona'
];

const ANAMNESE_FIELDS = [
  { id:'paciente',    label:'Paciente',               full:true  },
  { id:'nascimento',  label:'Data de Nascimento', type:'date'      },
  { id:'estadoCivil', label:'Estado civil'                        },
  { id:'profissao',   label:'Profissão'                           },
  { id:'endereco',    label:'Endereço',               full:true  },
  { id:'cidade',      label:'Cidade'                              },
  { id:'celular',     label:'Celular'                             },
  { id:'emergencia',  label:'Contato de emergência'               },
  { id:'instagram',   label:'Instagram'                           },
  { id:'email',       label:'E-mail'                              },
  { id:'cpf',         label:'CPF'                                 },
  { id:'indicado',    label:'Indicado por'                        }
];

const ANAMNESE_QUESTIONS = [
  { q:'Está sob algum tratamento médico?',                      detail:'Qual?' },
  { q:'Possui alguma doença (incluindo psicológica)?',          detail:'Qual?' },
  { q:'Tem alergia a algum medicamento, alimento ou inseto?',   detail:'Qual?' },
  { q:'É intolerante a lactose?',                               detail:'' },
  { q:'Faz uso de algum medicamento?',                          detail:'Qual?' },
  { q:'Tomou vacina recentemente?',                             detail:'Qual?' },
  { q:'Já teve algum tipo de câncer?',                          detail:'Qual?' },
  { q:'Está gestante?',                                         detail:'' },
  { q:'Está amamentando?',                                      detail:'Há quanto tempo?' },
  { q:'Possui filhos?',                                         detail:'Quantos?' },
  { q:'Possui algum tipo de cuidado estético?',                 detail:'Qual?' },
  { q:'Já fez algum tipo de tratamento estético?',              detail:'Qual? Ocorreu tudo bem?' },
  { q:'Utiliza ou já utilizou ácido na pele?',                  detail:'Qual?' },
  { q:'Se expõe muito ao sol?',                                 detail:'Com qual frequência?' },
  { q:'Há alguma outra informação que julgue importante?',      detail:'Qual?' }
];

/* ===== Rasteriza o emblema SVG para PNG (cache) ===== */
let _emblemPng = null;
function getEmblemPng() {
  if (_emblemPng) return Promise.resolve(_emblemPng);
  return new Promise((resolve) => {
    const blob = new Blob([CLINIC_EMBLEM_SVG], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 454; canvas.height = 536; // proporção do emblema (908x1072 / 2)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      _emblemPng = canvas.toDataURL('image/png');
      resolve(_emblemPng);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/* ===== Cabeçalho / rodapé / marca-d'água do PDF ===== */
const DOC_TAUPE = [127, 102, 88];
const DOC_GRAY  = [140, 128, 116];

function docHeader(doc, png) {
  if (png) doc.addImage(png, 'PNG', 14, 11, 14.5, 17);
  doc.setTextColor(...DOC_TAUPE);
  doc.setFont('helvetica', 'bold');   doc.setFontSize(15);
  doc.text(CLINIC_DOC.name, 33, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.setCharSpace(1.2); doc.text(CLINIC_DOC.role, 33.5, 23); doc.setCharSpace(0);
  // bloco direito
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(CLINIC_DOC.profession, 196, 15, { align: 'right' });
  doc.text(CLINIC_DOC.crbm, 196, 19.5, { align: 'right' });
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(...DOC_GRAY);
  doc.text(doc.splitTextToSize(CLINIC_DOC.note, 70), 196, 24, { align: 'right' });
  // endereço + régua
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...DOC_TAUPE);
  doc.text('Rua:', 14, 35);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 50, 42);
  doc.text(CLINIC_DOC.address, 23, 35);
  doc.text(CLINIC_DOC.cep, 196, 35, { align: 'right' });
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6); doc.setTextColor(...DOC_GRAY);
  doc.text(CLINIC_DOC.addressSub, 23, 38.5);
  doc.setDrawColor(...DOC_TAUPE); doc.setLineWidth(0.4); doc.line(14, 41, 196, 41);
  return 50; // y inicial do conteúdo
}

function docWatermark(doc, png) {
  if (!png) return;
  try {
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.05 }));
    doc.addImage(png, 'PNG', 62, 95, 86, 101.6);
    doc.restoreGraphicsState();
  } catch (e) { /* GState indisponível — ignora marca-d'água */ }
}

function docFooter(doc) {
  doc.setDrawColor(...DOC_TAUPE); doc.setLineWidth(0.4); doc.line(14, 280, 196, 280);
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(...DOC_GRAY);
  doc.text(doc.splitTextToSize(CLINIC_DOC.disclaimer, 95), 14, 284);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DOC_TAUPE);
  doc.text(`${CLINIC_DOC.phone}      @${CLINIC_DOC.instagram}`, 105, 291, { align: 'center' });
}

function docFieldLine(doc, label, value, x, y, width) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DOC_TAUPE);
  const labelW = doc.getTextWidth(label + ' ');
  doc.text(label, x, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28);
  doc.text(value || '', x + labelW, y);
  doc.setDrawColor(210, 198, 182); doc.setLineWidth(0.2);
  doc.line(x + labelW, y + 1.2, x + width, y + 1.2);
}

/* ===== Leitura de valores do DOM ===== */
const docVal = id => (document.getElementById(id)?.value || '').trim();
const docDateStr = id => { const v = docVal(id); return v ? fDate(v) : ''; };

/* Define um campo de data respeitando o date picker customizado do app
   (que troca o input nativo por um oculto + um display de texto). */
function setDocDate(id, iso) {
  const hidden = document.getElementById(id);
  if (hidden) hidden.value = iso || '';
  const disp = document.getElementById(id + '_display');
  if (disp) disp.value = iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '';
}

function checkboxPdf(doc, x, y, checked) {
  doc.setDrawColor(...DOC_TAUPE); doc.setLineWidth(0.3);
  doc.roundedRect(x, y - 3, 3.6, 3.6, 0.5, 0.5);
  if (checked) {
    doc.setDrawColor(...DOC_TAUPE); doc.setLineWidth(0.6);
    doc.line(x + 0.7, y - 1.3, x + 1.5, y - 0.4);
    doc.line(x + 1.5, y - 0.4, x + 3.1, y - 2.6);
  }
}

/* ============================================================
   ABA 1 — RECEITUÁRIO DE EXAMES (checklist → PDF)
   ============================================================ */
function renderExames() {
  const half = Math.ceil(EXAM_LIST.length / 2);
  const col = (items, offset) => items.map((name, i) => {
    const idx = offset + i;
    return `<label class="doc-check">
      <input type="checkbox" class="doc-check-input" id="exam_${idx}" value="${esc(name)}" />
      <span class="doc-check-box"></span>
      <span>${esc(name)}</span>
    </label>`;
  }).join('');

  const html = `
  <div class="section-header">
    <div><div class="section-title">Receituário de Exames</div><div class="section-sub">Marque os exames, salve na sua conta e gere o PDF</div></div>
    <div class="doc-actions">
      <button class="btn btn-secondary" onclick="newDoc('exames')">${iconPlus()} Novo</button>
      <button class="btn btn-secondary" onclick="pdfExames()">${iconDownload()} Gerar PDF</button>
      <button class="btn btn-primary" id="btnSalvarExames" onclick="saveDoc('exames')">${iconCheck()} Salvar</button>
    </div>
  </div>

  <div class="card doc-card">
    <div class="doc-block-title">Exames salvos</div>
    <div class="table-search doc-search">${iconSearch()}
      <input type="text" id="examesSearch" placeholder="Buscar por nome da paciente…" oninput="searchDoc('exames', this.value)" aria-label="Buscar receituário de exames por nome da paciente" autocomplete="off" spellcheck="false" />
    </div>
    <div id="examesList" class="doc-list">${docListLoadingHTML()}</div>
  </div>

  <div class="card doc-card" style="margin-top:20px">
    <div class="doc-block-title"><span id="examesFormTitle">Novo receituário de exames</span></div>
    <div class="form-grid" style="margin-bottom:14px">
      <div class="form-group">
        <label class="form-label" for="exPaciente">Paciente</label>
        <input type="text" class="form-control" id="exPaciente" placeholder="Nome da paciente…" />
      </div>
      <div class="form-group">
        <label class="form-label" for="exData">Data</label>
        <input type="date" class="form-control" id="exData" value="${today()}" />
      </div>
    </div>

    <div class="doc-toolbar">
      <span class="doc-toolbar-label">Exames solicitados</span>
      <div class="doc-toolbar-actions">
        <button type="button" class="btn btn-secondary btn-sm" onclick="examesToggleAll(true)">Marcar todos</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="examesToggleAll(false)">Limpar</button>
      </div>
    </div>

    <div class="doc-check-grid">
      <div>${col(EXAM_LIST.slice(0, half), 0)}</div>
      <div>${col(EXAM_LIST.slice(half), half)}</div>
    </div>

    <div class="form-group form-full" style="margin-top:18px">
      <label class="form-label" for="exOutros">Outros</label>
      <textarea class="form-control" id="exOutros" rows="2" placeholder="Outros exames não listados…"></textarea>
    </div>
  </div>`;

  setTimeout(() => loadDocs('exames'), 0);
  return html;
}

function examesToggleAll(state) {
  EXAM_LIST.forEach((_, i) => { const el = document.getElementById('exam_' + i); if (el) el.checked = state; });
}

async function pdfExames() {
  if (!window.jspdf) { toast('Biblioteca PDF não carregada.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const png = await getEmblemPng();

  docWatermark(doc, png);
  let y = docHeader(doc, png);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...DOC_TAUPE);
  doc.text('RECEITUÁRIO DE EXAMES', 105, y, { align: 'center' }); y += 10;

  doc.setFontSize(11);
  doc.text('PACIENTE:', 14, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28);
  doc.text(docVal('exPaciente'), 38, y);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...DOC_TAUPE);
  doc.text('Data: ', 160, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28);
  doc.text(docDateStr('exData') || '__/__/____', 173, y);
  y += 12;

  // checklist em 2 colunas
  const half = Math.ceil(EXAM_LIST.length / 2);
  const colX = [16, 110];
  const startY = y;
  let maxY = y;
  EXAM_LIST.forEach((name, i) => {
    const checked = !!document.getElementById('exam_' + i)?.checked;
    const colIndex = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const ry = startY + row * 8.2;
    checkboxPdf(doc, colX[colIndex], ry, checked);
    doc.setFont('helvetica', checked ? 'bold' : 'normal'); doc.setFontSize(10);
    doc.setTextColor(checked ? 60 : 90, checked ? 50 : 80, checked ? 42 : 70);
    doc.text(name, colX[colIndex] + 6, ry);
    if (ry > maxY) maxY = ry;
  });
  y = maxY + 12;

  const outros = docVal('exOutros');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...DOC_TAUPE);
  doc.text('Outros:', 14, y);
  doc.setDrawColor(210, 198, 182); doc.setLineWidth(0.2);
  if (outros) {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28);
    doc.text(doc.splitTextToSize(outros, 165), 30, y);
  } else {
    doc.line(30, y + 1, 196, y + 1);
  }
  y += 16;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DOC_TAUPE);
  doc.text('Carimbo e Data:', 130, 268);

  docFooter(doc);
  doc.save(`receituario-exames-${today()}.pdf`);
  toast('PDF de exames gerado!', 'success');
}

/* ============================================================
   ABA 2 — RECEITUÁRIO (texto livre → PDF)
   ============================================================ */
function renderReceituario() {
  const html = `
  <div class="section-header">
    <div><div class="section-title">Receituário</div><div class="section-sub">Escreva a prescrição, salve na sua conta e gere o PDF</div></div>
    <div class="doc-actions">
      <button class="btn btn-secondary" onclick="newDoc('receituario')">${iconPlus()} Novo</button>
      <button class="btn btn-secondary" onclick="pdfReceituario()">${iconDownload()} Gerar PDF</button>
      <button class="btn btn-primary" id="btnSalvarRec" onclick="saveDoc('receituario')">${iconCheck()} Salvar</button>
    </div>
  </div>

  <div class="card doc-card">
    <div class="doc-block-title">Receituários salvos</div>
    <div class="table-search doc-search">${iconSearch()}
      <input type="text" id="recSearch" placeholder="Buscar por nome da paciente…" oninput="searchDoc('receituario', this.value)" aria-label="Buscar receituário por nome da paciente" autocomplete="off" spellcheck="false" />
    </div>
    <div id="recList" class="doc-list">${docListLoadingHTML()}</div>
  </div>

  <div class="card doc-card" style="margin-top:20px">
    <div class="doc-block-title"><span id="recFormTitle">Novo receituário</span></div>
    <div class="form-grid" style="margin-bottom:6px">
      <div class="form-group">
        <label class="form-label" for="recPaciente">Paciente</label>
        <input type="text" class="form-control" id="recPaciente" placeholder="Nome da paciente…" />
      </div>
      <div class="form-group">
        <label class="form-label" for="recData">Data</label>
        <input type="date" class="form-control" id="recData" value="${today()}" />
      </div>
    </div>
    <div class="form-group form-full">
      <label class="form-label" for="recTexto">Prescrição</label>
      <textarea class="form-control doc-textarea" id="recTexto" rows="14" placeholder="Digite a prescrição…"></textarea>
    </div>
  </div>`;

  setTimeout(() => loadDocs('receituario'), 0);
  return html;
}

async function pdfReceituario() {
  if (!window.jspdf) { toast('Biblioteca PDF não carregada.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const png = await getEmblemPng();

  docWatermark(doc, png);
  let y = docHeader(doc, png);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...DOC_TAUPE);
  doc.text('PACIENTE:', 14, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28);
  doc.text(docVal('recPaciente'), 42, y);
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...DOC_TAUPE);
  doc.text('Data: ', 160, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28);
  doc.text(docDateStr('recData') || '__/__/____', 174, y);
  y += 14;

  const texto = docVal('recTexto');
  doc.setFontSize(11); doc.setTextColor(35, 30, 25);
  const lines = doc.splitTextToSize(texto || '', 178);
  doc.text(lines, 16, y, { lineHeightFactor: 1.7 });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DOC_TAUPE);
  doc.text('Carimbo e Data:', 130, 268);

  docFooter(doc);
  doc.save(`receituario-${today()}.pdf`);
  toast('PDF do receituário gerado!', 'success');
}

/* ============================================================
   ABA 3 — FICHA DE ANAMNESE (formulário → PDF)
   ============================================================ */
function renderAnamnese() {
  const fields = ANAMNESE_FIELDS.map(f => `
    <div class="form-group ${f.full ? 'form-full' : ''}">
      <label class="form-label" for="an_${f.id}">${f.label}</label>
      <input type="${f.type || 'text'}" class="form-control" id="an_${f.id}" />
    </div>`).join('');

  const questions = ANAMNESE_QUESTIONS.map((item, i) => `
    <div class="doc-question">
      <div class="doc-question-head">
        <span class="doc-question-num">${i + 1}</span>
        <span class="doc-question-text">${esc(item.q)}</span>
        <div class="doc-radio-group">
          <label class="doc-radio"><input type="radio" name="anq_${i}" value="não" /> Não</label>
          <label class="doc-radio"><input type="radio" name="anq_${i}" value="sim" /> Sim</label>
        </div>
      </div>
      ${item.detail ? `<input type="text" class="form-control doc-question-detail" id="and_${i}" placeholder="${esc(item.detail)}" />` : ''}
    </div>`).join('');

  const html = `
  <div class="section-header">
    <div><div class="section-title">Ficha de Anamnese</div><div class="section-sub">Harmonização Facial — preencha, salve na sua conta e gere o PDF</div></div>
    <div class="doc-actions">
      <button class="btn btn-secondary" onclick="newDoc('anamnese')">${iconPlus()} Nova ficha</button>
      <button class="btn btn-secondary" onclick="pdfAnamnese()">${iconDownload()} Gerar PDF</button>
      <button class="btn btn-primary" id="btnSalvarAnamnese" onclick="saveDoc('anamnese')">${iconCheck()} Salvar ficha</button>
    </div>
  </div>

  <div class="card doc-card">
    <div class="doc-block-title">Fichas salvas</div>
    <div class="table-search doc-search">${iconSearch()}
      <input type="text" id="anamneseSearch" placeholder="Buscar por nome da paciente…" oninput="searchDoc('anamnese', this.value)" aria-label="Buscar ficha por nome da paciente" autocomplete="off" spellcheck="false" />
    </div>
    <div id="anamneseList" class="doc-list">${docListLoadingHTML()}</div>
  </div>

  <div class="card doc-card" style="margin-top:20px">
    <div class="doc-block-title"><span id="anamneseFormTitle">Nova ficha — dados da paciente</span></div>
    <div class="form-group" style="max-width:240px;margin-bottom:16px">
      <label class="form-label" for="an_data">Data da consulta</label>
      <input type="date" class="form-control" id="an_data" value="${today()}" />
    </div>
    <div class="form-grid">${fields}</div>

    <div class="form-group form-full" style="margin-top:8px">
      <label class="form-label" for="an_objetivo">Objetivo da consulta</label>
      <textarea class="form-control" id="an_objetivo" rows="2"></textarea>
    </div>
  </div>

  <div class="card doc-card" style="margin-top:20px">
    <div class="doc-block-title">Questionário de saúde</div>
    <div class="doc-questions">${questions}</div>
  </div>

  <div class="card doc-card" style="margin-top:20px">
    <div class="form-group form-full">
      <label class="form-label" for="an_obs">Observações</label>
      <textarea class="form-control" id="an_obs" rows="3"></textarea>
    </div>
    <p class="doc-term">Termo de responsabilidade: ao gerar este documento, a paciente declara estar ciente e de acordo com todas as informações acima relacionadas.</p>
  </div>`;

  setTimeout(() => loadDocs('anamnese'), 0);
  return html;
}

/* ===== Persistência de Documentos (Supabase) — genérico p/ as 3 abas ===== */
const DOC_CONFIG = {
  anamnese: {
    table: 'anamneses', noun: 'ficha',
    nameId: 'an_paciente', dateId: 'an_data',
    listId: 'anamneseList', titleId: 'anamneseFormTitle', saveBtnId: 'btnSalvarAnamnese',
    titleNew: 'Nova ficha — dados da paciente',
    emptyLabel: 'Nenhuma ficha salva ainda. Preencha abaixo e clique em “Salvar ficha”.',
    collect: () => collectAnamneseData(),
    fill: (d) => fillAnamneseForm(d)
  },
  receituario: {
    table: 'receituarios', noun: 'receituário',
    nameId: 'recPaciente', dateId: 'recData',
    listId: 'recList', titleId: 'recFormTitle', saveBtnId: 'btnSalvarRec',
    titleNew: 'Novo receituário',
    emptyLabel: 'Nenhum receituário salvo ainda.',
    collect: () => ({ texto: docVal('recTexto') }),
    fill: (d) => { const el = document.getElementById('recTexto'); if (el) el.value = (d && d.texto) || ''; }
  },
  exames: {
    table: 'exames', noun: 'receituário de exames',
    nameId: 'exPaciente', dateId: 'exData',
    listId: 'examesList', titleId: 'examesFormTitle', saveBtnId: 'btnSalvarExames',
    titleNew: 'Novo receituário de exames',
    emptyLabel: 'Nenhum receituário de exames salvo ainda.',
    collect: () => ({ selecionados: EXAM_LIST.filter((_, i) => document.getElementById('exam_' + i)?.checked), outros: docVal('exOutros') }),
    fill: (d) => {
      d = d || {}; const sel = d.selecionados || [];
      EXAM_LIST.forEach((name, i) => { const el = document.getElementById('exam_' + i); if (el) el.checked = sel.includes(name); });
      const o = document.getElementById('exOutros'); if (o) o.value = d.outros || '';
    }
  }
};

const _docStore = {
  anamnese:    { list: [], search: '', editingId: null },
  receituario: { list: [], search: '', editingId: null },
  exames:      { list: [], search: '', editingId: null }
};

function docListLoadingHTML() { return `<div class="doc-list-empty">Carregando…</div>`; }

async function loadDocs(type) {
  const cfg = DOC_CONFIG[type], st = _docStore[type];
  const listEl = document.getElementById(cfg.listId);
  if (typeof currentUser === 'undefined' || !currentUser) { if (listEl) listEl.innerHTML = `<div class="doc-list-empty">Faça login para ver os registros salvos.</div>`; return; }
  const { data, error } = await db(cfg.table)
    .select('id,patient_name,doc_date,created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) { if (listEl) listEl.innerHTML = `<div class="doc-list-empty">Erro ao carregar.</div>`; return; }
  st.list = data || [];
  renderDocList(type);
}

function renderDocList(type) {
  const cfg = DOC_CONFIG[type], st = _docStore[type];
  const listEl = document.getElementById(cfg.listId);
  if (!listEl) return;
  const term = st.search.trim().toLowerCase();
  const items = term ? st.list.filter(a => (a.patient_name || '').toLowerCase().includes(term)) : st.list;
  if (!items.length) {
    listEl.innerHTML = `<div class="doc-list-empty">${st.list.length ? 'Nenhum resultado para essa busca.' : cfg.emptyLabel}</div>`;
    return;
  }
  listEl.innerHTML = items.map(a => {
    const d = a.doc_date ? fDate(a.doc_date) : (a.created_at ? new Date(a.created_at).toLocaleDateString('pt-BR') : '');
    const name = a.patient_name || '(sem nome)';
    const active = a.id === st.editingId ? ' doc-list-item-active' : '';
    return `<div class="doc-list-item${active}">
      <button type="button" class="doc-list-info" onclick="openDoc('${type}','${a.id}')">
        <span class="doc-list-name">${esc(name)}</span>
        <span class="doc-list-date">${d}</span>
      </button>
      <div class="td-actions">
        <button type="button" class="btn btn-ghost btn-icon" title="Abrir" aria-label="Abrir ${cfg.noun} de ${esc(name)}" onclick="openDoc('${type}','${a.id}')">${iconEdit()}</button>
        <button type="button" class="btn btn-danger btn-icon" title="Excluir" aria-label="Excluir ${cfg.noun} de ${esc(name)}" onclick="deleteDoc('${type}','${a.id}')">${iconTrash()}</button>
      </div>
    </div>`;
  }).join('');
}

function searchDoc(type, term) { _docStore[type].search = term || ''; renderDocList(type); }

function collectAnamneseData() {
  const data = { fields: {}, objetivo: docVal('an_objetivo'), observacoes: docVal('an_obs'), respostas: [] };
  ANAMNESE_FIELDS.forEach(f => data.fields[f.id] = docVal('an_' + f.id));
  ANAMNESE_QUESTIONS.forEach((item, i) => data.respostas.push({ answer: anamneseAnswer(i), detail: item.detail ? docVal('and_' + i) : '' }));
  return data;
}

function fillAnamneseForm(data) {
  data = data || {};
  const fields = data.fields || {};
  ANAMNESE_FIELDS.forEach(f => {
    if (f.type === 'date') { setDocDate('an_' + f.id, fields[f.id] || ''); }
    else { const el = document.getElementById('an_' + f.id); if (el) el.value = fields[f.id] || ''; }
  });
  const obj = document.getElementById('an_objetivo'); if (obj) obj.value = data.objetivo || '';
  const obs = document.getElementById('an_obs'); if (obs) obs.value = data.observacoes || '';
  ANAMNESE_QUESTIONS.forEach((item, i) => {
    const r = (data.respostas && data.respostas[i]) || {};
    document.querySelectorAll(`input[name="anq_${i}"]`).forEach(el => { el.checked = (el.value === r.answer); });
    const det = document.getElementById('and_' + i); if (det) det.value = r.detail || '';
  });
}

function setDocTitle(type, txt) { const t = document.getElementById(DOC_CONFIG[type].titleId); if (t) t.textContent = txt; }

function newDoc(type) {
  const cfg = DOC_CONFIG[type], st = _docStore[type];
  st.editingId = null;
  cfg.fill({});
  const nameEl = document.getElementById(cfg.nameId); if (nameEl) nameEl.value = '';
  setDocDate(cfg.dateId, today());
  setDocTitle(type, cfg.titleNew);
  renderDocList(type);
  if (nameEl) nameEl.focus();
}

async function saveDoc(type) {
  const cfg = DOC_CONFIG[type], st = _docStore[type];
  if (typeof currentUser === 'undefined' || !currentUser) { toast('Faça login para salvar.', 'error'); return; }
  const name = docVal(cfg.nameId);
  if (!name) { toast('Informe o nome da paciente para salvar.', 'error'); const el = document.getElementById(cfg.nameId); if (el) el.focus(); return; }
  const btn = document.getElementById(cfg.saveBtnId); if (btn) btn.disabled = true;
  const payload = { patient_name: name, doc_date: docVal(cfg.dateId) || null, data: cfg.collect(), updated_at: new Date().toISOString() };
  let error;
  if (st.editingId) {
    ({ error } = await db(cfg.table).update(payload).eq('id', st.editingId));
  } else {
    const id = (typeof uid === 'function' ? uid() : crypto.randomUUID());
    ({ error } = await db(cfg.table).insert({ id, user_id: currentUser.id, ...payload }));
    if (!error) st.editingId = id;
  }
  if (btn) btn.disabled = false;
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
  toast('Salvo!', 'success');
  setDocTitle(type, 'Editando — ' + name);
  await loadDocs(type);
}

async function openDoc(type, id) {
  const cfg = DOC_CONFIG[type], st = _docStore[type];
  const { data, error } = await db(cfg.table).select('*').eq('id', id).single();
  if (error || !data) { toast('Erro ao abrir registro.', 'error'); return; }
  st.editingId = id;
  cfg.fill(data.data);
  const nameEl = document.getElementById(cfg.nameId); if (nameEl) nameEl.value = data.patient_name || '';
  setDocDate(cfg.dateId, data.doc_date || '');
  setDocTitle(type, 'Editando — ' + (data.patient_name || ''));
  renderDocList(type);
  toast('Registro carregado.', 'success');
  const t = document.getElementById(cfg.titleId); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteDoc(type, id) {
  const cfg = DOC_CONFIG[type], st = _docStore[type];
  if (!confirm('Excluir este registro definitivamente?')) return;
  const { error } = await db(cfg.table).delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', 'error'); return; }
  if (st.editingId === id) { st.editingId = null; newDoc(type); }
  toast('Registro excluído.', 'success');
  await loadDocs(type);
}

function anamneseAnswer(i) {
  const el = document.querySelector(`input[name="anq_${i}"]:checked`);
  return el ? el.value : '';
}

async function pdfAnamnese() {
  if (!window.jspdf) { toast('Biblioteca PDF não carregada.', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const png = await getEmblemPng();
  pdfAnamnese._col = 0;

  docWatermark(doc, png);
  let y = docHeader(doc, png);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...DOC_TAUPE);
  doc.text('FICHA DE ANAMNESE — HARMONIZAÇÃO FACIAL', 105, y, { align: 'center' });
  y += 8;
  doc.setFontSize(9);
  doc.text('Data da consulta: ', 14, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28);
  doc.text(docDateStr('an_data') || '__/__/____', 47, y);
  y += 7;

  // dados da paciente (2 colunas)
  ANAMNESE_FIELDS.forEach(f => {
    const val = f.type === 'date' ? docDateStr('an_' + f.id) : docVal('an_' + f.id);
    if (f.full) {
      docFieldLine(doc, f.label + ':', val, 14, y, 182); y += 7.5;
    } else {
      // alterna colunas
      if (!pdfAnamnese._col) { docFieldLine(doc, f.label + ':', val, 14, y, 95); pdfAnamnese._col = 1; }
      else { docFieldLine(doc, f.label + ':', val, 110, y, 196); pdfAnamnese._col = 0; y += 7.5; }
    }
  });
  if (pdfAnamnese._col) { pdfAnamnese._col = 0; y += 7.5; }
  y += 2;

  const obj = docVal('an_objetivo');
  docFieldLine(doc, 'Objetivo da consulta:', obj, 14, y, 182); y += 10;

  // questionário
  doc.setDrawColor(...DOC_TAUPE); doc.setLineWidth(0.3); doc.line(14, y - 4, 196, y - 4);
  ANAMNESE_QUESTIONS.forEach((item, i) => {
    if (y > 262) { docFooter(doc); doc.addPage(); docWatermark(doc, png); y = docHeader(doc, png); }
    const ans = anamneseAnswer(i);
    const detail = item.detail ? docVal('and_' + i) : '';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...DOC_TAUPE);
    doc.text(`${i + 1}.`, 14, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28); doc.setFontSize(9.5);
    const qLines = doc.splitTextToSize(item.q, 120);
    doc.text(qLines, 20, y);
    // resposta
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...DOC_TAUPE);
    doc.text(ans ? ('( ' + ans + ' )') : '(  )', 150, y);
    let yy = y + (qLines.length - 1) * 4.6;
    if (item.detail && detail) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(90, 80, 70);
      const dLines = doc.splitTextToSize(item.detail + ' ' + detail, 174);
      doc.text(dLines, 20, yy + 5);
      yy += 5 + (dLines.length - 1) * 4.4;
    }
    y = yy + 8;
  });

  if (y > 250) { docFooter(doc); doc.addPage(); docWatermark(doc, png); y = docHeader(doc, png); }
  doc.setDrawColor(...DOC_TAUPE); doc.setLineWidth(0.3); doc.line(14, y - 3, 196, y - 3);
  const obs = docVal('an_obs');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...DOC_TAUPE);
  doc.text('Observações:', 14, y + 3);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 34, 28); doc.setFontSize(9.5);
  doc.text(doc.splitTextToSize(obs || '', 165), 42, y + 3);
  y += 22;

  if (y > 255) { docFooter(doc); doc.addPage(); docWatermark(doc, png); y = docHeader(doc, png); }
  doc.setFontSize(8.5); doc.setTextColor(90, 80, 70); doc.setFont('helvetica', 'italic');
  doc.text('Estou ciente e de acordo com todas as informações acima relacionadas.', 105, y, { align: 'center' });
  y += 14;
  doc.setDrawColor(120, 105, 92); doc.setLineWidth(0.3);
  doc.line(14, y, 70, y); doc.line(100, y, 196, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DOC_TAUPE);
  doc.text('Data: ' + (docDateStr('an_data') || ''), 14, y + 4);
  doc.text('Assinatura da(o) paciente', 100, y + 4);

  docFooter(doc);
  doc.save(`ficha-anamnese-${today()}.pdf`);
  toast('PDF da ficha de anamnese gerado!', 'success');
}
