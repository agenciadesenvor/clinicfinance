# Novo visual do ClinicFinance — design

Data: 2026-11-23 · Status: aguardando aprovação

## Intenção

O Elison viu um vídeo de um app pessoal de organização e achou o visual lindo. Ele quer o ClinicFinance com **essa cara**, sem ganhar nenhuma função que não tenha a ver com a clínica: as mesmas telas e os mesmos dados de hoje, com outra roupa. Ele pediu explicitamente três coisas da referência: a faixa do topo com foto, as **pastas** ("veja onde encaixa mais") e o estilo dos **gráficos**.

Referência visual (quadros do vídeo, fora do git): `.superpowers/referencia-visual/` — `q_1.jpg` (tela inicial), `q_11.jpg` (financeiro, cartões, barras por categoria), `q_25.jpg` (pastas, cartões de números, gráfico com pico), `folha_0*.jpg` (todas as telas em miniatura).

## Objetivos

- Trocar a identidade visual inteira: cores, letras, menu lateral, cabeçalhos de tela, cartões, abas, botões, etiquetas e gráficos, valendo para **todas** as telas (17 telas + Íris).
- Tela inicial reorganizada no estilo da referência, com faixa de capa com foto.
- A Dra. pode trocar a foto da capa quando quiser.
- Pastas na área de Documentos.
- Gráficos com o acabamento da referência, em todas as telas que têm gráfico.

## Não-objetivos

- Nenhuma função nova além do que está escrito aqui (a troca da foto e a tela das pastas são as únicas peças novas, e só usam dados que já existem).
- Não copiar a pintura das araucárias, o mascote de pinha, o nome nem os textos da referência — são da autora. Pega-se a linguagem visual, não os desenhos.
- Não mexer em regras de negócio, cálculos, banco (fora a coluna da capa) nem nas Edge Functions da Íris.

## Anti-objetivos (seria fracasso mesmo funcionando)

- Alguma tela quebrada, ilegível ou com cor antiga "vazando" (marrom-café no meio do verde e laranja).
- Celular pior do que hoje: a Dra. usa no celular; o menu e as telas precisam continuar funcionando bem em tela pequena.
- Texto com contraste ruim (laranja claro sobre creme, por exemplo).
- Informação que existe hoje na tela inicial sumir.

## Restrições

- SPA estática em JS puro, sem build (index.html + style.css + *.js), Chart.js 4.4 via CDN, publicada no Vercel. Toda publicação troca o `?v=` dos arquivos mudados.
- Os perfis ficam na tabela `profiles` (já tem `avatar_data` e `logo_data` em base64, redimensionados por `resizeImage` em app.js). Mudança de banco só por SQL que o Elison roda no painel do Supabase.
- Nada de dado real de paciente em commit, prévia ou exemplo.
- Prévia local em `_preview_docs.html` (gerada de index.html + `_preview_seed.js`, fora do git).

## Abordagens consideradas

1. **Nova camada de estilo por cima do que existe** (escolhida): trocar as variáveis de cor e fonte do style.css, acrescentar uma camada "VISUAL PINHAL" no fim do style.css (como foi feito com o "MENU CÁPSULA"), varrer as cores fixas antigas (23 ocorrências do marrom em style.css) e reescrever só o HTML da tela inicial e o tema dos gráficos. Risco baixo, todas as telas mudam juntas, dá para entregar em partes.
2. Reescrever o style.css do zero: resultado mais limpo, mas 3.300 linhas e 17 telas para refazer e testar; risco alto de quebrar telas que ninguém olha todo dia.
3. Só a tela inicial e o menu: rápido, mas o resto do sistema ficaria com a cara antiga — contradiz o pedido.

Escolha minha (o Elison deixou o "como" comigo): abordagem 1, em duas entregas publicadas separadamente.

## O desenho

### Linguagem visual (vale para tudo)

- **Fundo** creme claro (perto de `#F6F0E6`); **cartões** em bege um tom acima (perto de `#EFE6D7`), borda fina quente, cantos de ~18px, sem sombra pesada.
- **Cores de destaque**: laranja queimado (perto de `#C8702A`) e verde-musgo (perto de `#2F4A2C`). Verde é a cor de ação (botão principal, aba ativa, "Ver todas"); laranja é a cor de destaque e de dado (números, contadores, gráfico). Apoio: rosa-terroso e sálvia, só nas pastas e etiquetas. Vermelho tijolo para atraso/erro.
- **Letras**: títulos serifados finos com uma parte em itálico ("Agenda *Compromissos*", "Bom dia, *Patrícia*"); rótulos pequenos em fonte monoespaçada maiúscula espaçada ("SALDO DO MÊS", "CLINICFINANCE / AGENDA"); texto corrido sem serifa. Números grandes em serifa.
- **Cabeçalho de cada tela**: trilha pequena em mono ("CLINICFINANCE / ENTRADAS"), título serifado + subtítulo em itálico. Cada tela ganha seu subtítulo curto (lista na implementação; ex.: Entradas *Atendimentos e receitas*, Saídas *Despesas da clínica*, Agenda *Compromissos*).
- **Abas e filtros**: grupo em pílula com a ativa em verde-musgo e texto creme; etiquetas/filtros como pílulas com contorno.
- **Botões**: principal em verde-musgo; secundários com contorno; botões pequenos tipo "VER TODAS" em pílula verde com texto mono maiúsculo.

### Menu lateral

- Painel claro, separado em blocos arredondados como na referência: no topo logo "Clinic*Finance*" (parte em itálico laranja) + foto da Dra. e atalho "+"; no meio os itens com ícone e nome; embaixo Perfil/Sair.
- Aberto com nomes por padrão no computador; o botão de recolher continua levando ao modo só-ícones que já existe (cápsula). Item ativo: fundo branco, nome em serifa itálica.
- Contadores (ex.: pendências) em bolinha laranja, como o "11" da referência.
- Celular: continua o comportamento atual de menu que abre por cima, só com o visual novo.

### Tela inicial

Tudo o que existe hoje continua; muda a arrumação:

1. **Faixa de capa** (largura toda): à esquerda, trilha "CLINICFINANCE / INÍCIO · DOMINGO, 23 DE NOVEMBRO", saudação "Bom dia, *Patrícia*" (nome em itálico), uma linha mono com o resumo do dia a partir de dados que já existem (atendimentos de hoje na agenda e pendências), e atalhos em pílula: "+ Entrada", "+ Saída", "+ Agendamento", "+ Paciente" (todos já existem no sistema). À direita, a **foto da capa**, esmaecendo para o creme da esquerda para o texto ficar legível.
2. **Filtro de período** (Hoje/Semana/Mês/Ano/Período) logo abaixo, à esquerda; aviso "nenhuma entrada no período" quando houver.
3. **Linha de três cartões**:
   - **Financeiro** (cartão laranja): lucro líquido do período em serifa grande; abaixo receita e despesas em mono; barras finas da receita dos últimos meses (o gráfico de receita de hoje, com o seletor "esta semana / 6 meses / 12 meses"), comparação com o período anterior.
   - **Atendimentos** (cartão verde-musgo): número de atendimentos em serifa grande, linha fina dos atendimentos no período com o ponto mais alto marcado por uma pílula laranja com o valor, comparação com o período anterior.
   - **Agenda** (cartão bege): mini calendário do mês com o dia de hoje em laranja e pontinho nos dias com agendamento; embaixo "Hoje · N atendimentos"; clicar leva para a Agenda.
4. **Linha de baixo**: "Últimas entradas", "Agenda e pendências" e **"Despesas por categoria"** — este último troca a rosca de hoje por barras horizontais por categoria (como "Gastos por categoria" da referência), com o valor ao lado.

### Foto da capa

- Nova coluna `profiles.capa_data` (texto, imagem em base64), criada por um SQL de uma linha que o Elison roda.
- Em **Perfil**, novo campo "Foto da capa da tela inicial" com enviar/trocar/remover, redimensionada no navegador (largura máx. ~1600px, JPEG) com o `resizeImage` que já existe; salva junto com o perfil.
- Na própria capa, um botão discreto "Trocar foto" (aparece ao passar o mouse; no celular, ícone pequeno) que abre a escolha de arquivo e salva direto.
- Sem foto escolhida: fundo de cor e textura suave, sem imagem, para qualquer conta. A **foto da clínica** que o Elison vai mandar entra uma vez pelo "Trocar foto" na conta da Dra. (o cadastro é aberto a outras contas, então a foto dela não fica como padrão no projeto).
- A capa não deve deixar o carregamento do app mais lento: a imagem é lida junto com o perfil, como a logo.

### Pastas (Documentos)

- Hoje "Documentos" é um grupo no menu que abre quatro telas (Ficha de Anamnese, Receituário, Receituário de Exames, Contratos). Passa a abrir uma **tela "Documentos *Fichas e receitas*"** com quatro pastas desenhadas, uma por tipo, cada uma numa cor de apoio (pêssego, rosa-terroso, sálvia, areia).
- Cada pasta mostra: o número de documentos salvos em serifa grande, o nome do tipo embaixo, e folhas de papel "saindo" da pasta (desenho, sem nome de paciente). Clicar abre a tela daquele tipo, como hoje.
- Abaixo das pastas, "Últimos documentos": os 6 mais recentes dos quatro tipos juntos (tipo, nome da paciente, data), clicando abre o documento. Usa só as tabelas que já existem (`anamneses`, `receituarios`, `exames`, `contratos_assinados`).
- No menu, "Documentos" vira um item só que abre essa tela; as quatro telas continuam existindo e ficam com "Documentos" marcado no menu enquanto abertas.

### Gráficos

- Tema único para todos os gráficos (Chart.js `defaults` em app.js + cores por gráfico): sem grade pesada (no máximo linhas horizontais pontilhadas bem claras), rótulos dos eixos em mono pequeno, legenda em bolinhas pequenas, linhas finas sem preenchimento ou com preenchimento muito leve, barras finas de cantos arredondados, cores da paleta nova.
- Gráfico de linha: ponto mais alto marcado com pílula laranja com o valor.
- Distribuição por categoria (despesas na tela inicial e as distribuições em Gráficos): barras horizontais com valor, no lugar de roscas, quando for "quanto de cada categoria".
- Vale para a tela inicial, a tela Gráficos (5 gráficos) e o CRM (3 gráficos).

### Demais telas

Herdam a linguagem visual pelas variáveis e pela nova camada (cartões, tabelas, formulários, janelas, avisos, Íris). Não ganham reorganização de conteúdo, só cabeçalho novo e acabamento. Tabelas: cabeçalho em mono maiúsculo pequeno, linhas separadas por fio fino.

## Decisões tomadas na revisão (minhas, para o Elison conferir)

- **Barra do topo**: deixa de ter o título da tela. Fica uma faixa fina no alto à direita, como na referência, com a busca de pacientes (campo compacto que se abre ao clicar), o sino de notificações (com o número e a lista de hoje) e a foto/iniciais. O título de cada tela passa a ser o cabeçalho novo dentro da tela (trilha + título serifado + subtítulo), substituindo o `section-title`/`section-sub` de hoje — sem título duplicado. Na tela inicial a faixa de capa fica logo abaixo dessa faixa fina. No celular, o botão do menu continua no mesmo lugar.
- **Botão "+" do menu lateral**: abre a janela de "Nova entrada", que já existe. Sem contadores novos no menu: o único número que já existe (pendências) continua no sino.
- **"Atendimentos"**: o cartão verde continua contando as entradas registradas no período, como hoje, com o rótulo "atendimentos registrados". O que vem da agenda é chamado de "agendamentos" ("Hoje · 3 agendamentos"), para a mesma palavra não mostrar dois números diferentes.
- **Tela de login** (auth.html): entra na entrega 1, só cores e letras, para a primeira tela não ficar com a cor antiga.
- **PDFs** (receitas, fichas, contratos): não mudam. São a marca impressa da Dra., que as pacientes recebem.

## Entregas

1. **Base + menu + tela inicial + capa**: cores, letras, cabeçalhos, menu lateral, tela inicial nova, foto da capa (com o SQL), tema dos gráficos aplicado em todo lugar. Publicada e conferida.
2. **Pastas + gráficos + varredura**: tela de Documentos com pastas, troca das roscas por barras onde couber, e passada tela a tela (incluindo celular e Íris) para tirar sobras do visual antigo.

Antes de publicar cada entrega: prévia local conferida em computador e celular, e print mostrado ao Elison.

## O que fica com quem constrói

- Valores exatos de cor, tamanhos e espaçamentos, dentro do descrito.
- Escolha exata das fontes no Google Fonts (serifa fina com itálico bonito — pode manter Fraunces se ficar parecido — e uma mono para os rótulos), cuidando do peso do carregamento.
- Desenho das pastas e das folhas (CSS/SVG).
- Subtítulos de cada tela.
- Como organizar o CSS novo, desde que as telas antigas não quebrem.
