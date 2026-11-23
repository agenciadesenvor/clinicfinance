# Novo visual do ClinicFinance — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao ClinicFinance a linguagem visual da referência (creme, laranja queimado, verde-musgo, serifa com itálico, rótulos mono) em todas as telas, com tela inicial nova com capa, pastas em Documentos e gráficos no estilo da referência.

**Architecture:** Troca de variáveis + camada "VISUAL PINHAL" no fim do style.css (padrão já usado no "MENU CÁPSULA"); um helper de cabeçalho de tela usado por todas as telas; tela inicial reescrita em dashboard.js; tema único de gráficos em `applyChartTheme` + um plugin de "pílula no pico"; tela nova `documentos` em documentos.js.

**Tech Stack:** HTML/CSS/JS puro sem build, Chart.js 4.4 (CDN), Supabase PostgREST via `db()` em app.js, Google Fonts, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-23-novo-visual-design.md` (ler inteiro; referência visual em `.superpowers/referencia-visual/`, fora do git).

## Global Constraints

- Sem build, sem dependência nova além de uma fonte mono do Google Fonts.
- Toda publicação troca o `?v=` de cada arquivo alterado em index.html (e auth.html quando mudar auth.css).
- Nenhum dado real de paciente em commit, prévia ou exemplo.
- PDFs (documentos.js, cor `#7F6658` da logo) **não mudam**.
- Nada do vídeo é copiado como desenho: sem araucárias, sem mascote, sem textos dele.
- Paleta (valores de partida, ajuste fino permitido): fundo `#F6F0E6`, cartão `#EFE6D7`, borda `#E2D6C3`, texto `#2E2A24` / `#6F6558` / `#A3978A`, laranja `#C8702A` (escuro `#A85A1E`), verde `#2F4A2C` (escuro `#233822`), rosa-terroso `#D9A08B`, sálvia `#A9B89A`, pêssego `#EFC59A`, areia `#E6D3B3`, tijolo `#B4472E`.
- Contraste de texto AA: texto laranja só em tamanho grande ou sobre creme com `#A85A1E`; texto sobre cartão laranja/verde em creme `#FBF6EE`.
- Celular (< 768px) precisa continuar funcionando: menu por cima com o botão de menu, telas em uma coluna.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Coluna `capa_data` ainda não criada** (o app publicado antes do SQL rodar): o perfil e o app precisam abrir normalmente, sem capa. → teste na Task 4.
2. **Período sem nenhuma entrada / conta nova vazia**: tela inicial sem erro, cartões com R$ 0,00 e gráficos vazios desenhados, pastas com 0. → testes nas Tasks 5 e 8.
3. **Foto enorme (ex.: 12 MB do celular) ou arquivo que não é imagem** na troca da capa: redimensiona para ≤ 1600px ou recusa com aviso, sem travar. → teste na Task 4.
4. **Nomes e valores longos** (paciente com nome comprido, R$ 1.234.567,89) nos cartões, pastas e listas: não estouram o cartão (reticências). → teste nas Tasks 5 e 8.
5. **Cor antiga vazando** em telas pouco usadas (Precificação, Margem, Íris, janelas, avisos, toasts). → varredura automática na Task 10.

## Como verificar (vale para todas as tasks)

Não há testes automatizados de frontend no projeto. Cada task verifica na prévia local:

- Regerar a prévia: `sed 's/?v=[0-9a-z]*/?v=ppNN/g' index.html > _preview_docs.html` (NN novo a cada vez) e colocar antes de `</body>` as duas linhas que a prévia atual já tem (o `<script src="_preview_seed.js?v=ppNN">` e o script inline que chama `showApp()`, `initSidebarState()`, `seedDemo()`, `navigateTo(...)`) — copiar do `_preview_docs.html` atual antes de sobrescrever.
- Servidor: `preview_start {name: "clinic-finance"}` → `http://localhost:3456/_preview_docs.html#<tela>`.
- Checagens com `javascript_tool` (asserções abaixo devem retornar `true`) e prints em 1440×900 e em celular (preset mobile).
- `read_console_messages {onlyErrors: true}` vazio.
- Se uma task precisar de método novo no `db()` ou tabela nova, o mock de `_preview_seed.js` ganha o equivalente (arquivo fora do git).

---

### Task 1: Fontes, cores e base

**Files:**
- Modify: `index.html:11` (link de fontes), `index.html:6` (`theme-color` → `#F6F0E6`), `index.html` tela de carregamento (cores fixas `#DCD0BF`/`#7F6658`/`#7C6F63` → novas)
- Modify: `style.css` `:root` (linhas ~39–70) e as 23 ocorrências de `#7F6658`/`#6A5446`/`rgba(127,102,88,…)`
- Modify: `style.css` (fim do arquivo): nova camada `/* ===== VISUAL PINHAL ===== */`

**Interfaces:**
- Produces (CSS, usado por todas as tasks): variáveis `--bg`, `--bg-2`, `--card`, `--line`, `--text-1/2/3`, `--accent` (= verde), `--accent-hover`, `--accent-light`, `--accent-mid`, `--orange`, `--orange-dk`, `--green`, `--green-dk`, `--rose`, `--sage`, `--peach`, `--sand`, `--brick`, `--font-display` (serifa), `--font-mono`, `--font-body`; classes utilitárias `.mono-label` (mono 11px maiúsculo, `letter-spacing: .08em`), `.pill-btn` (pílula verde mono maiúscula), `.tabs-pill` (grupo de abas com ativa verde).
- `--accent` passa a ser o verde-musgo (cor de ação) para que tudo que hoje usa `--accent` vire verde sem tocar nas telas.

- [ ] **Step 1:** Trocar o link do Google Fonts para Fraunces (ital, opsz, wght 300–500), DM Sans (mantém) e IBM Plex Mono (400, 500). Mesma troca em `auth.html:10`.
- [ ] **Step 2:** Reescrever as variáveis de `:root` com a paleta das Global Constraints; trocar as 23 cores fixas antigas por variáveis.
- [ ] **Step 3:** Criar a camada VISUAL PINHAL com: fundo, cartões (`.card`, `.d2-card`, `.stat-card` e afins: fundo `--card`, borda 1px `--line`, raio 18px, sem sombra pesada), botões (`.btn-primary` verde, `.btn-ghost` contorno), campos de formulário, tabelas (cabeçalho `.mono-label`, linhas com fio fino), janelas (`.modal`), toasts, `.empty-state` com título em serifa.
- [ ] **Step 4: Verificar** — em `#entradas`, `#saidas`, `#perfil`:
  ```js
  // nenhuma cor marrom antiga em elemento visível
  [...document.querySelectorAll('body *')].filter(e => e.offsetParent).every(e => {
    const c = getComputedStyle(e); return ![c.color, c.backgroundColor, c.borderColor].some(v => v.includes('127, 102, 88') || v.includes('106, 84, 70'));
  })
  getComputedStyle(document.body).backgroundColor === 'rgb(246, 240, 230)'
  document.fonts.check('16px "IBM Plex Mono"')
  ```
  Print das três telas.
- [ ] **Step 5: Commit** `feat(visual): paleta, fontes e base do novo visual`

### Task 2: Cabeçalho das telas e barra do topo

**Files:**
- Modify: `app.js` — `navigateTo` (mapa `titles` vira `SCREENS`), as 12 ocorrências de `section-title` em app.js; `agenda.js:47`; `crm.js:53,104`; `documentos.js:189,312,439,819`; `iris.js:26`
- Modify: `dashboard.js:309` `updateTopbarTitle` (passa a não escrever título na barra)
- Modify: `index.html:207–250` (barra do topo), `style.css` camada VISUAL PINHAL

**Interfaces:**
- Produces: `const SCREENS = { [view]: { title: string, sub: string } }` em app.js (todas as 17 telas + `documentos` da Task 8) e `function pageHeader(view: string, extraRightHTML?: string): string` que devolve `<header class="ph">` com `.ph-trail` ("CLINICFINANCE / " + título em maiúsculas, `.mono-label`), `<h1 class="ph-title">título <em>sub</em></h1>` e o `extraRightHTML` à direita (os botões que hoje ficam ao lado do `section-title` em cada tela continuam ali).
- Subtítulos (copiar exatamente): Entradas *Atendimentos e receitas* · Saídas *Despesas da clínica* · Pacientes *Cadastro e histórico* · Consultório *Gastos do espaço* · Produtos & Insumos *Estoque e custos* · Precificação *Quanto cobrar* · Margem de Lucro *O que sobra* · Gráficos & Relatórios *Visão completa* · CRM de Atendimento *Funil e follow-ups* · Agenda *Compromissos* · Íris *Secretária virtual* · Ficha de Anamnese *Harmonização facial* · Receituário *Prescrições* · Receituário de Exames *Pedidos de exame* · Contratos & Termos *Consentimentos* · Meu Perfil *Sua conta* · Documentos *Fichas e receitas*. O texto explicativo que hoje está em `section-sub` (quando tiver instrução útil, ex. Anamnese, Contratos, Íris) vira uma linha `.ph-note` abaixo do título.

- [ ] **Step 1:** Implementar `SCREENS` e `pageHeader`; trocar os 20 blocos `section-title`/`section-sub` por `pageHeader(view, <botões que já estavam ao lado>)`.
- [ ] **Step 2:** Barra do topo: remover `#pageTitle` da barra (manter o elemento oculto só se algum código ainda escrever nele — preferir remover as escritas), remover `#dateBadge` e o botão de tema (`toggleTheme` só força o claro; remover o botão, manter a função), deixar à direita: busca compacta (ícone; ao clicar/focar abre o campo de 260px sobre a barra, `#gsInput` e `#gsResults` com os mesmos ids e handlers), sino `#notifBtn` com `#notifBadge` em laranja, avatar. Fundo transparente, altura ~56px. No celular, `#menuBtn` fica à esquerda como hoje.
- [ ] **Step 3: Verificar** — em cada uma das 17 telas (loop com `navigateTo`):
  ```js
  document.querySelectorAll('#content .ph').length === 1 && !document.querySelector('#content .section-title')
  ```
  Busca: digitar 2 letras em `#gsInput` abre `#gsResults`; sino abre `#notifDropdown`. Print de Entradas no computador e no celular.
- [ ] **Step 4: Commit** `feat(visual): cabeçalho das telas e barra do topo enxuta`

### Task 3: Menu lateral

**Files:**
- Modify: `index.html:20–205` (sidebar), `app.js:2611` `initSidebarState`, `style.css` (camada MENU CÁPSULA continua para o modo recolhido; o modo aberto ganha regras na camada VISUAL PINHAL)

**Interfaces:**
- Consumes: variáveis da Task 1.
- Produces: `#sidebarQuickAdd` (botão "+", chama `openEntradaModal()`).

- [ ] **Step 1:** Estrutura em três blocos arredondados (`.sb-block`): topo (logo "Clinic<em>Finance</em>" com itálico laranja; foto/iniciais da Dra. vinda de `#sidebarAvatar`; botão `+`), itens (ícone + nome; ativo com fundo `#FBF6EE` e nome em `--font-display` itálico), rodapé (Perfil e Sair; o `#sidebarToggle` continua).
- [ ] **Step 2:** `initSidebarState`: padrão passa a ser **aberto** no computador; só recolhe se `localStorage['cf-sidebar-collapsed'] === '1'`. Trocar o comentário da linha 2610.
- [ ] **Step 3: Verificar** — com `localStorage.clear()` e recarregar: `!document.getElementById('sidebar').classList.contains('collapsed')`; clicar em `#sidebarToggle` recolhe e a escolha sobrevive a recarregar; `#sidebarQuickAdd` abre a janela de nova entrada; no celular o menu abre por cima e fecha ao navegar. Prints aberto, recolhido e celular.
- [ ] **Step 4: Commit** `feat(visual): menu lateral claro com nomes`

### Task 4: Foto da capa

**Files:**
- Create: `capa.sql` (uma linha: `alter table public.profiles add column if not exists capa_data text;`)
- Modify: `app.js` — carga do perfil (linha ~366), `renderPerfil` (~2288–2420), salvar perfil (~2500)
- Modify: `dashboard.js` (função usada pela Task 5)

**Interfaces:**
- Produces: `currentProfile.capa_data: string` ('' quando não há); `async function loadCapa(): Promise<void>` (busca só `capa_data` em consulta separada; se a coluna não existir ou der erro, deixa `''` e não mostra erro); `function pickCapa(): void` (abre seletor de arquivo, valida `image/*`, redimensiona com `resizeImage(file, 1600, cb)`, salva `profiles.capa_data` com `db('profiles').update(...)`, atualiza a tela inicial e mostra toast "Foto da capa atualizada"); `function removeCapa(): Promise<void>`.

- [ ] **Step 1:** `loadCapa` chamada depois da carga do perfil, sem entrar na consulta principal (a consulta da linha 366 **não** ganha `capa_data`, para o app abrir mesmo sem a coluna).
- [ ] **Step 2:** Perfil: seção "Foto da capa da tela inicial" no mesmo formato da seção "Logo da empresa" (prévia, botão Trocar, botão Remover); usa `pickCapa`/`removeCapa`.
- [ ] **Step 3:** Recusar arquivo que não é imagem com toast "Escolha uma imagem (JPG ou PNG)."; se o update falhar por coluna inexistente, toast "A foto da capa ainda não está ativada. Rode o capa.sql no Supabase."
- [ ] **Step 4: Verificar** (mock da prévia com e sem a coluna):
  ```js
  // sem coluna: app abre e capa vazia
  currentProfile.capa_data === '' && !!document.querySelector('#content .ph, #content .hero')
  // depois de pickCapa com imagem 4000x3000: largura salva <= 1600
  ```
  Testar arquivo .pdf → toast de recusa. Print do Perfil.
- [ ] **Step 5: Commit** `feat(visual): foto da capa da tela inicial` (incluir `capa.sql`)

### Task 5: Tela inicial nova

**Files:**
- Modify: `dashboard.js` (`renderDashboard`, `initDashboardCharts`, `renderRevChart`, `renderCostChart`, `dashKpi`), `app.js` `db()` (métodos `gte`, `lte`), `style.css` camada VISUAL PINHAL (prefixo `.h3-`)

**Interfaces:**
- Consumes: `pageHeader` não é usado aqui (a capa é o cabeçalho); `currentProfile.capa_data`, `pickCapa` (Task 4); `peakLabelPlugin` (Task 6 — se a Task 6 vier depois, o gráfico funciona sem o plugin e ganha a pílula quando ela entrar).
- Produces: `db(...).gte(col, val)` e `.lte(col, val)` (mesmo padrão de `eq`: `col=gte.val`); `function catBarsHTML(items: {label: string, value: number}[], opts?: {money?: boolean, max?: number}): string` (barras horizontais com valor; usada também na Task 9); `async function loadMonthAppointmentDays(year: number, month: number): Promise<Set<string>>` (datas `YYYY-MM-DD` com agendamento não cancelado no mês, uma consulta `select('data,status')` com `gte/lte`).

- [ ] **Step 1:** Capa (`.hero`): trilha `CLINICFINANCE / INÍCIO · <DIA DA SEMANA>, <D> DE <MÊS>` em mono; "Bom dia|Boa tarde|Boa noite, <em>primeiro nome</em>"; linha mono "VOCÊ TEM N AGENDAMENTOS HOJE E M PENDÊNCIAS" (N = `getTodayAppointments().length`, M = follow-ups + contas a vencer, mesma conta do sino menos as consultas; zero vira "AGENDA LIVRE HOJE"); pílulas "+ Entrada" (`openEntradaModal`), "+ Saída" (abre a janela de nova saída que já existe), "+ Agendamento" (`navigateTo('agenda')`), "+ Paciente" (a janela de novo paciente do CRM que já existe). Foto à direita com gradiente do creme para transparente; sem foto, textura suave (gradiente + ruído CSS). Botão "Trocar foto" (`pickCapa`) visível ao passar o mouse; no celular, ícone fixo pequeno. No celular a foto vira faixa de 140px acima do texto.
- [ ] **Step 2:** Abaixo da capa: `periodFilterHTML()` e o aviso de período vazio que já existe.
- [ ] **Step 3:** Linha de três cartões:
  - **Financeiro** (laranja `--orange`, texto creme): "Lucro líquido" mono, valor `cur.lucro` em serifa 44px, linha mono "RECEITA R$ x · DESPESAS R$ y", chip de comparação (`dashChip`), barras finas da receita (o `chartRevExp` de hoje, mesmo seletor semana/6/12, barras creme, mês atual em creme cheio e os outros em creme 45%).
  - **Atendimentos** (verde `--green`): `cur.n` em serifa 44px, "atendimentos registrados" mono, chip de comparação, linha fina com a contagem de entradas por dia do período (por mês se o período for Ano ou mais de 62 dias), pílula laranja no maior valor.
  - **Agenda** (bege): mini calendário do mês atual (S T Q Q S S D), hoje com círculo laranja, ponto pequeno nos dias de `loadMonthAppointmentDays`; rodapé "Hoje · N agendamentos" + seta para a Agenda.
- [ ] **Step 4:** Linha de baixo (três cartões): "Últimas entradas" (`dashLastEntries`), "Agenda e pendências" (`dashPendencias`), "Despesas por categoria" (`catBarsHTML` com as categorias que hoje alimentam `renderCostChart`, maior primeiro, máx. 6 + "Outras"). A rosca `chartCost` sai.
- [ ] **Step 5: Verificar** — prévia com dados e com `state.data.entries = []`:
  ```js
  document.querySelectorAll('.hero, .h3-fin, .h3-att, .h3-cal').length === 4
  !!state.chartInstances.chartRevExp && !document.getElementById('chartCost')
  // valor longo não estoura o cartão
  (el => el.scrollWidth <= el.clientWidth)(document.querySelector('.h3-fin .h3-big'))
  ```
  Conferir que tudo que a tela inicial mostrava antes continua: receita, atendimentos, lucro, gráfico de receita com seletor, despesas, últimas entradas, pendências. Prints 1440×900 e celular, com e sem foto.
- [ ] **Step 6: Commit** `feat(visual): tela inicial com capa e cartões coloridos`

### Task 6: Tema dos gráficos

**Files:**
- Modify: `app.js:779` `applyChartTheme`, `app.js:2220–2290` (cores dos 5 gráficos de Gráficos), `crm.js:215–240` (cores dos 3 gráficos)

**Interfaces:**
- Produces: `const CHART_COLORS = { orange, green, rose, sage, peach, sand, brick, grid }` e `const peakLabelPlugin` (plugin Chart.js, id `peakLabel`): num dataset de linha com `peakLabel: true`, desenha ponto no maior valor e pílula laranja com o valor formatado acima dele (formato: `dataset.peakFormat?.(v) ?? v`).

- [ ] **Step 1:** `applyChartTheme`: fonte dos eixos `--font-mono` 10px cor `#A3978A`; grade só horizontal, pontilhada, `rgba(46,42,36,0.06)`; sem borda de eixo; linhas 2px sem pontos (exceto o pico); barras `borderRadius: 6`, `maxBarThickness: 14`; tooltip fundo `#2E2A24`, raio 10; legenda bolinhas 7px. Registrar `peakLabelPlugin` com `Chart.register`.
- [ ] **Step 2:** Recolorir os gráficos de Gráficos (`gChartLine` com `peakLabel: true`, `gChartProc`, `gChartMargin`) e do CRM (barra e linha) com `CHART_COLORS`; as roscas recebem só as cores novas (troca por barras na Task 9).
- [ ] **Step 3: Verificar** — em `#graficos` e `#crm`: `Object.keys(state.chartInstances).length >= 5` e sem erro no console; print mostrando a pílula no pico da linha.
- [ ] **Step 4: Commit** `feat(visual): tema dos gráficos com pílula no pico`

### Task 7: Tela de login

**Files:**
- Modify: `auth.css`, `auth.html` (fontes da Task 1, `theme-color`)

- [ ] **Step 1:** Mesma paleta, serifa no título com itálico ("Clinic<em>Finance</em>"), botão principal verde, campos no estilo da Task 1. Sem mudar campos nem fluxo.
- [ ] **Step 2: Verificar** — abrir `http://localhost:3456/auth.html` no computador e celular; print; nenhuma cor marrom antiga (mesma asserção da Task 1).
- [ ] **Step 3: Commit** `feat(visual): tela de login no novo visual`

### Publicação da entrega 1

- [ ] Pedir ao Elison para rodar `capa.sql` no Supabase (o app funciona sem ele; só a troca de foto avisa).
- [ ] Trocar `?v=` de todos os arquivos alterados em index.html e auth.html; commit; push para main; deploy manual no Vercel (`create_deployment` com o sha); conferir as versões em produção com `curl`.
- [ ] Mostrar prints ao Elison.

### Task 8: Documentos com pastas

**Files:**
- Modify: `documentos.js` (nova `renderDocumentos`), `app.js` (`renderView`, `SCREENS`, `navigateTo` marca o item "Documentos" ativo também em anamnese/receituario/exames/contratos), `index.html:131–170` (grupo vira um item `data-view="documentos"`), `style.css` camada VISUAL PINHAL (`.folder-*`)

**Interfaces:**
- Consumes: `DOC_CONFIG` (tabelas `anamneses`, `receituarios`, `exames`), `contratos_assinados`, `openDoc(type, id)`, `pageHeader`.
- Produces: `function renderDocumentos(): string` e `async function loadDocumentosResumo(): Promise<{counts: Record<'anamnese'|'receituario'|'exames'|'contratos', number>, recentes: {type: string, nome: string, data: string, id: string}[]}>` (uma consulta leve por tabela: id, nome da paciente, data; recentes = 6 mais novos dos quatro tipos juntos).

- [ ] **Step 1:** Quatro pastas em grade (2×2 no celular): Fichas de anamnese (pêssego), Receituários (rosa-terroso), Pedidos de exame (sálvia), Contratos assinados (areia). Cada pasta: aba da pasta, três folhas brancas inclinadas saindo por cima (CSS, linhas cinza simulando texto, **sem** nomes), número em serifa grande, nome do tipo embaixo em serifa, "N documentos" em mono. Clique → `navigateTo(<tipo>)`.
- [ ] **Step 2:** "Últimos documentos": lista com ícone do tipo, nome da paciente (reticências se longo), tipo e data; clique abre o documento (`navigateTo(tipo)` e depois `openDoc(tipo, id)`; contratos abrem a lista de assinados). Vazio: "Nenhum documento salvo ainda."
- [ ] **Step 3:** Menu: o grupo Documentos vira item único; `toggleNavGroup`/`syncNavGroups` deixam de ser usados por ele (manter as funções se outro grupo usar; senão remover).
- [ ] **Step 4: Verificar** — com e sem documentos no mock:
  ```js
  document.querySelectorAll('.folder').length === 4
  document.querySelector('.nav-item[data-view="documentos"]').classList.contains('active') // também após navigateTo('receituario')
  ```
  Print computador e celular.
- [ ] **Step 5: Commit** `feat(visual): Documentos com pastas`

### Task 9: Roscas viram barras por categoria

**Files:**
- Modify: `app.js:2249–2272` (`gChartCat`, `gChartPay`), `crm.js` (rosca de origem), `style.css`

**Interfaces:**
- Consumes: `catBarsHTML` (Task 5).

- [ ] **Step 1:** Trocar `gChartCat` (despesas por categoria), `gChartPay` (formas de pagamento) e a rosca do CRM (`crmChartOrigem`) por `catBarsHTML` com os mesmos dados que alimentavam as roscas; o cartão mantém título e posição.
- [ ] **Step 2: Verificar** — `!document.querySelector('canvas#gChartCat, canvas#gChartPay, canvas#crmChartOrigem')` e as somas exibidas batem com as somas antigas (comparar no console antes/depois com o mesmo mock). Print.
- [ ] **Step 3: Commit** `feat(visual): distribuições em barras por categoria`

### Task 10: Varredura tela a tela

**Files:** quaisquer de `style.css`, `iris.css` e telas, só acabamento.

- [ ] **Step 1:** Abrir as 18 telas (17 + documentos), cada janela principal (nova entrada, nova saída, paciente, agendamento, produto), toasts e a Íris (abas Conversas, Manual, Promoções, Configurações), no computador e no celular; corrigir sobras do visual antigo e quebras.
- [ ] **Step 2: Verificar** — loop por todas as telas rodando a asserção de cor antiga da Task 1 e `scrollWidth <= clientWidth` no `#content` (sem rolagem lateral no celular); console sem erros. Prints de todas as telas num único arquivo de contato para o Elison.
- [ ] **Step 3: Commit** `fix(visual): acabamento tela a tela`

### Publicação da entrega 2

- [ ] Trocar `?v=`, commit, push, deploy manual, conferir em produção, mostrar prints ao Elison.
