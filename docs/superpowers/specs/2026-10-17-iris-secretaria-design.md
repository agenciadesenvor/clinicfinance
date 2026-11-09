# Íris — secretária com IA no WhatsApp (desenho)

Data: 17/10/2026 · Projeto: ClinicFinance (consultório da Dra. Patrícia Nascimento)
Status: rascunho para aprovação (decisões finais de 09/11/2026 incorporadas)

Convenções deste documento:
- **[decidido]**: decisão tomada pelo cliente (Elison / Dra. Patrícia) na conversa de desenho.
- **[nossa decisão]**: decisão tomada por quem escreveu o desenho, para o cliente conferir.
- **[em aberto]**: só o cliente pode responder, e a resposta muda o que é construído.

---

## 1. Intenção e motivação

O consultório atende pelo WhatsApp. Hoje a secretária, **Rosi**, responde as pacientes seguindo o *Kit de Atendimento* (documento da Desenvor, 31/08/2026) e repassa à Dra. as perguntas que não pode responder. O objetivo é colocar uma IA, a **Íris**, na linha de frente desse atendimento, para:

- responder em segundos, 24 horas por dia, 7 dias por semana (o kit pede resposta em até 5 minutos: "quem responde primeiro costuma atender");
- qualificar, agendar e cobrar sozinha os casos simples;
- tirar trabalho repetitivo da Rosi, que passa a cuidar só do que precisa dela;
- deixar tudo organizado visualmente (Kanban) e não perder nenhum follow-up.

A Íris **é a Rosi em escala, seguindo o kit**. Ela não é um produto novo com regras próprias.

### O que é sucesso [decidido]
- Mais avaliações agendadas.
- Menos trabalho manual para a Rosi.
- Funil e follow-ups visíveis nos quadros, sem pendência esquecida.

Medido pelos 4 números do kit: conversas que chegaram, avaliações agendadas, comparecimentos e procedimentos fechados. Ao lado, quantas conversas a Íris resolveu sozinha e quantas precisaram da Rosi ou da Dra.

### O que é fracasso (antiobjetivos) [decidido]
- **Dar informação errada sobre procedimento.** É o motivo número 1 para a Dra. desligar a Íris. Todo o desenho de conteúdo (seção 6) existe para impedir isso.
- Parecer robô: texto formal, longo ou de folheto.
- Mentir que é humana quando perguntada diretamente (ver seção 3).

### Fora do escopo desta versão [decidido]
- **Reativação da base:** a régua dos grupos A a D, do documento "Reativação da Base", fica para a fase 2.
- **Disparos em massa e promoções ativas por iniciativa da clínica:** ficam para a fase 2.
- **Respostas em áudio:** a Íris lê e escuta, mas responde só em texto.

---

## 2. Contexto técnico atual

- **App:** SPA estático (HTML, CSS e JS puro, sem build) na Vercel. Fala direto com o Supabase pelo browser (helper `db()` sobre o REST). Arquivos principais: `app.js`, `crm.js`, `kanban.js`, `agenda.js`, `documentos.js`, `importar.js`.
- **Supabase:** projeto `hpaamwlkjelzhuhumbqy`, com RLS por `user_id`. O consultório é **uma conta**, a da Dra. Patrícia; todo dado da Íris pertence a esse `user_id`. O projeto está no plano gratuito, que **pausa depois de 7 dias sem uso**: já pausou uma vez.
- **CRM existente:**
  - `crm_pacientes`, com status de funil `novo`, `contato`, `agendado`, `cliente`, `retorno` e `inativo`; etiquetas em `etiquetas text[]` e tabela `crm_etiquetas` (`etiquetas.sql`, ainda precisa ser rodado no banco);
  - `crm_interacoes`, que é a linha do tempo;
  - **Kanban do funil** em `kanban.js`.
- **Agenda existente:** tabela `agendamentos` (`paciente_id`, `paciente_nome`, `procedimento`, `data`, `hora_inicio`, `hora_fim`, `status` agendado/confirmado/realizado/cancelado, `google_event_id`). A sincronização com o Google Agenda hoje é **só no navegador**, com token de sessão (GIS). Um servidor não consegue usar esse token.
- **Pagamentos da clínica:** InfinitePay (Pix e cartão).

---

## 3. Identidade e tom da Íris [decidido]

- **Nome:** Íris. Ela se apresenta só pelo nome, como alguém do consultório: "Aqui é a Íris, do consultório da Dra. Patrícia." **Sem** "assistente virtual" na conversa. É exigência da Dra.: atendimento o mais humanizado possível.
- **Transparência (formato aceito pela Dra.):**
  - Uma linha discreta na descrição do perfil do WhatsApp e no aviso de privacidade: "Atendimento com apoio de inteligência artificial, acompanhado pela equipe".
  - Se a paciente perguntar diretamente se é robô ou IA, a Íris **nunca nega**. Responde com naturalidade que é a assistente digital do consultório e que a Rosi e a Dra. acompanham as conversas, e oferece chamar a Rosi na hora.
- **Tom: opção B, "elegante e objetiva".** É a recepção de uma clínica sofisticada: gentil, sem intimidade forçada. Exemplo de referência:
  > Olá, Camila, tudo bem? Aqui é a Íris, do consultório da Dra. Patrícia.
  > O que você gostaria de melhorar no rosto?

  > É uma preocupação muito comum, e a Dra. Patrícia leva isso a sério: ela trabalha por etapas, sempre buscando um resultado natural.
  > O valor do procedimento é definido na avaliação, que custa R$ 100 e é descontada se você fizer no mesmo dia.
  > Tenho quinta às 14h ou sexta às 10h. Qual prefere?
- **Regras de escrita:**
  - Usa o nome e as palavras da paciente.
  - Uma ideia por mensagem, de 1 a 2 linhas.
  - Termina com **uma** pergunta ou com **dois horários**.
  - Fala "a Dra." e "o consultório".
  - No máximo um emoji, e nem sempre.
  - Nunca: "Em que posso ajudar?", "Prezada", "Agradecemos o contato", "nossa equipe de especialistas", "excelência", parágrafo longo, lista com marcadores, duas perguntas na mesma mensagem, exclamação em toda frase.
- **Comportamento humano:** indicador "digitando…", pausa curta antes de responder e respostas longas quebradas em várias mensagens.
- **Base de texto:** os roteiros do *Kit de Atendimento* (primeira resposta, descoberta, preço, objeções, agendamento, confirmação, falta e pós-procedimento), reescritos no tom B. O kit é a fonte de verdade de comportamento; o tom B é a fonte de verdade de estilo.
- **[nossa decisão]** O cliente achou os primeiros exemplos de tom "robóticos" e aprovou a opção B. Se possível, calibrar com 3 ou 4 prints reais de conversas da Rosi (anonimizados) antes de ligar a Íris, para afinar o vocabulário. Não é bloqueante.

---

## 4. Divisão entre Íris, Rosi e Dra. [decidido]

- **A Íris responde primeiro, sempre**, inclusive durante o expediente.
- **A Rosi assume quando precisa:**
  - pelo botão "Assumir conversa";
  - ou simplesmente escrevendo na conversa. **Qualquer mensagem da Rosi pausa a Íris naquela conversa.**
- **[nossa decisão]** A Íris volta à conversa quando a Rosi clica em **"Devolver para a Íris"**, ou automaticamente depois de **12 horas** sem mensagem da Rosi naquela conversa. Ao voltar, ela lê o histórico e não repete o que a Rosi já disse.
- **24/7:** fora do horário a Íris atende **igual ao horário comercial**. Conversa, tira dúvidas, qualifica, agenda e cobra.

### Quando a Íris passa para a Dra. (seção 8 do kit)
Gravidez, amamentação, doença, medicação em uso, alergia, "posso fazer tendo [condição]?", "vai funcionar no meu caso?", pedido de desconto ou parcelamento diferente, paciente insatisfeita ou reclamando, procedimento feito em outro lugar ou por outro profissional, e qualquer pergunta sobre procedimento que não esteja no manual aprovado (seção 6). Também perguntas que o kit manda deixar para a avaliação, como "quanto tempo dura" ou "quanto tempo fico inchada": nesses casos a Íris responde com a frase do kit e oferece a avaliação, sem inventar.

O que acontece:
1. A Íris responde à paciente com a frase padrão do kit, no tom B: "Essa é uma pergunta para a Dra. Patrícia responder; não quero te passar informação errada. Vou falar com ela e já te retorno, tudo bem?"
2. Aplica uma etiqueta com o motivo, por exemplo "Dúvida clínica", "Desconto" ou "Insatisfeita".
3. Move o card do CRM para a **nova coluna "Aguardando Dra."**.
4. Para de responder **sobre aquele assunto** até a Dra. ou a Rosi resolverem. **[decidido]** Quem resolve **responde direto à paciente**, escrevendo na conversa pelo app (a Dra. pelo card "Aguardando Dra." ou a Rosi pela tela de conversas). A Íris não reescreve nem repassa a resposta da Dra.: depois que a equipe responde, ela retoma só o resto do atendimento (agendamento, pagamento, follow-up), lendo o que foi dito para não contradizer. **[nossa decisão]** O resto da conversa continua: por exemplo, a Íris pode seguir agendando a avaliação enquanto a dúvida clínica espera. Se a paciente insistir no assunto pendente, a Íris repete que a Dra. vai responder.
5. **[nossa decisão]** Responder pela conversa marca o assunto como resolvido (há também o botão "Resolvido" para quando a Dra. falou com a paciente por outro meio). O card volta para a etapa em que estava antes, por exemplo "Em contato".

### Casos urgentes [decidido]
Paciente relatando dor, inchaço fora do normal, mancha ou qualquer coisa estranha **depois de um procedimento**:
- Tudo o que está acima, mais a etiqueta **"🚨 Urgente"**.
- **A Dra. recebe na hora uma mensagem no WhatsApp pessoal dela**, com o nome da paciente, o que ela relatou e um link para abrir a conversa no CRM. Isso exige um template de mensagem aprovado pela Meta ("alerta urgente").
- A Íris diz à paciente que a Dra. já foi avisada e vai falar com ela.
- **[nossa decisão, frase precisa de aval da Dra.]** Se a paciente descrever sinal grave (dor muito forte, pele ficando branca ou arroxeada, dificuldade para respirar), a Íris também orienta procurar atendimento de emergência imediatamente.

---

## 5. Agendamento e pagamento [decidido]

### Regras por procedimento
| | Avaliação | Limpeza de pele | Botox | Demais procedimentos |
|---|---|---|---|---|
| A Íris informa o preço? | Sim: R$ 100 | Sim: R$ 130 | "A partir de R$ 1.000, depende das áreas" | Não. "O valor é definido na avaliação" |
| Como se agenda | Direto | Direto | Só depois da avaliação | Só depois da avaliação |
| Pagamento para reservar | R$ 100 antes | 50% (R$ 65) antes, o resto no dia | — | — |
| Tempo na agenda | 30 min | 1 hora | — | — |

- **Abatimento:** os R$ 100 da avaliação são **descontados** se a paciente fechar o procedimento **no mesmo dia** (harmonização, bioestimulador, botox e outros). Quem aplica o desconto é a clínica no atendimento; a Íris só informa.
- **Promoções:** quando houver promoção há desconto. A Íris só fala de promoção **cadastrada** na tela "Promoções ativas" (procedimento, valor ou desconto, validade) e dentro da validade. Nunca inventa desconto (regra do kit).
- **Lista de procedimentos da clínica:** Botox, Preenchimento labial, Preenchimento de olheiras, Fios de PDO, Rinomodelação, Harmonização facial, Bioestimulador, Skinbooster, Microagulhamento, Limpeza de pele, Peeling químico, Hialuronidase, Laser.

### Horários em que a Íris pode marcar
- **Segunda a sexta:** 9h às 18h. **Sábado:** 9h às 12h. **Almoço:** 12h às 13h sempre livre.
- **Alguns dias até 19h, a critério da Dra.** A Dra. ou a Rosi podem **abrir horário extra ou bloquear horários** em dias específicos pela Agenda, e a Íris respeita.
- **[decidido]** A Íris também evita horários ocupados no Google Agenda da Dra., já na primeira versão. Ver a restrição técnica na seção 9.
- **Oferta de horários:** sempre **duas opções**, como manda o kit, priorizando as mais próximas.
- **Capacidade [decidido]:** **uma paciente por vez**. A Dra. faz todos os atendimentos (inclusive limpeza de pele) e há uma única agenda. Agendamentos sem `hora_fim` contam como ocupando o tempo padrão do procedimento (avaliação 30 min, limpeza 1h, demais 1h — **[nossa decisão]** para os demais, até a Dra. definir no Manual).

### Fluxo de reserva
1. A paciente quer agendar (avaliação ou limpeza), e a Íris oferece 2 horários livres.
2. A paciente escolhe um. A Íris explica o valor (e o abatimento, no caso da avaliação) e envia **um link do Checkout Integrado InfinitePay** com o valor certo (R$ 100 ou R$ 65), aceitando Pix ou cartão. **Não envia chave Pix solta**, porque o sistema não fica sabendo de pagamento feito pela chave.
3. **O horário fica segurado por 30 minutos** a partir do envio do link.
4. **Depois de 3 minutos sem pagamento**, a Íris pergunta com leveza se a paciente conseguiu pagar e oferece ajuda com o link.
5. **Pagamento aprovado:**
   - O sistema confirma o pagamento (ver "confirmação segura" abaixo).
   - A Íris **reserva**: cria o agendamento.
   - O card vai para **"Agendado"**, com a etiqueta "Sinal pago".
   - A Íris confirma com a paciente: data, hora, endereço e "um dia antes eu te envio uma confirmação".
6. **30 minutos sem pagamento:** o horário é liberado. Se a paciente voltar, a Íris oferece novos horários.
   - **[nossa decisão] Pagamento que chega depois dos 30 min** (o link continua válido): se o horário ainda estiver livre, a Íris reserva normalmente. Se já foi ocupado, ela oferece os dois próximos horários e o valor fica como crédito; reembolso, se a paciente pedir, é com a Rosi.
   - **[nossa decisão] Financeiro:** cada sinal aprovado vira automaticamente uma **entrada** no ClinicFinance, com origem "Íris · sinal" e forma de pagamento Pix ou cartão, conforme o `capture_method`. No dia do atendimento a clínica lança só a diferença: o procedimento menos o sinal, ou o restante da limpeza.
7. **Confirmação na véspera:** enviada automaticamente (seção 7).

### Remarcar, cancelar e procedimentos depois da avaliação [nossa decisão]
- **Remarcar:** a Íris remarca sozinha **uma vez**, com pelo menos 24h de antecedência, mantendo o sinal pago. Em cima da hora, ou numa segunda remarcação, passa para a Rosi.
- **Cancelar:** a Íris registra o pedido e passa para a Rosi, que decide sobre o sinal conforme a política de cancelamento (seção 10).
- **Procedimentos depois da avaliação** (botox, harmonização e outros): nesta versão quem agenda é a clínica, no próprio atendimento ou pela Rosi. A Íris não agenda sozinha procedimento que dependa de avaliação.

### Confirmação segura do pagamento (InfinitePay)
O Checkout Integrado InfinitePay ([documentação oficial](https://www.infinitepay.io/checkout-documentacao)) permite:
- `POST https://api.checkout.infinitepay.io/links` com `handle` (InfiniteTag da clínica), `items` (preço em centavos), `order_nsu` (id da reserva no nosso sistema), `webhook_url`, `redirect_url` e `customer`;
- **webhook** de pagamento aprovado (`order_nsu`, `transaction_nsu`, `invoice_slug`, `paid_amount`, `capture_method`, `receipt_url`, ...), reenviado em caso de resposta 400;
- `POST https://api.checkout.infinitepay.io/payment_check` para consultar o status.

O webhook **não é autenticado**: não há chave de API, só o `handle`. Por isso, **ao receber o webhook, o sistema confirma o pagamento chamando `payment_check` antes de reservar**, e deduplica por `transaction_nsu`. Pagamentos feitos fora do link, pela chave Pix direta, são conferidos manualmente pela Rosi no app InfinitePay.

---

## 6. Conteúdo: o "Manual da Íris" [decidido]

O antiobjetivo número 1 é informação errada sobre procedimento. Por isso:

- **Nova tela "Manual da Íris"** no ClinicFinance, com um item por procedimento da lista da seção 5:
  - o que é;
  - para quem é indicado, em termos gerais;
  - preparo antes;
  - cuidados depois;
  - se a Íris pode informar o preço (e qual) ou se é "só na avaliação";
  - tempo na agenda;
  - se agenda direto;
  - valor do sinal.
- **Interruptor "Aprovado pela Dra." por item.** A Íris **só usa itens aprovados**. Perguntas sobre itens não aprovados, ou fora do que está escrito, vão para "Aguardando Dra.".
- **Rascunhos iniciais:** cada procedimento vem com um texto inicial marcado como rascunho, e a Dra. corrige e aprova. As regras já decididas (preços, durações, sinal e horários da seção 5) entram preenchidas.
- **Informações práticas no mesmo lugar:** endereço, como chegar, formas de pagamento, política de cancelamento e de atraso, e "o que a Íris nunca diz" (campo a preencher pela Dra., que o kit deixa "A PREENCHER").
- **Promoções ativas:** procedimento, valor ou desconto e validade (seção 5).
- **Regras invioláveis (seção 9 do kit), também no comportamento da Íris:**
  - não dá diagnóstico, não indica procedimento e não diz o que a paciente "precisa fazer";
  - não promete resultado;
  - não inventa preço, prazo, duração ou promoção;
  - não envia foto de outra paciente;
  - não insiste depois do segundo toque sem resposta;
  - não discute com paciente irritada (passa para a Dra.);
  - não fala mal de outro profissional.

### Começo supervisionado [decidido]
Nas **primeiras 2 semanas**, toda resposta **em texto livre** da Íris aparece como **rascunho** na tela de conversas, e a Rosi escolhe **Enviar**, **Editar** ou **"Eu respondo"**. **[nossa decisão]** As ações de sistema não passam por aprovação, para o fluxo de pagamento funcionar:
- segurar o horário por 30 min, o lembrete de 3 min, a reserva após o pagamento confirmado e a mensagem padrão de confirmação;
- o link de pagamento, quando a paciente já escolheu o horário num rascunho aprovado;
- etiquetas, mudança de card e alerta urgente para a Dra.;
- follow-ups por template. Depois, a Íris responde sozinha.

**Fora do expediente, mesmo no período supervisionado [decidido]:** quando o consultório está fechado (fora dos horários de atendimento da seção 5, domingos e feriados), a Íris **responde sozinha**, sem esperar aprovação, para a paciente da noite não ficar sem resposta. De manhã a Rosi revisa essas conversas pelo filtro **"Respondidas fora do expediente"** da tela de conversas, e pode corrigir ou assumir qualquer uma. As regras de passar para a Dra. e de urgência valem igual nesse horário.

**[nossa decisão]** A troca para o modo automático é um interruptor na tela de configurações da Íris, ligado pela Dra. ou pela Rosi quando estiverem confiantes, e não por data fixa.

---

## 7. Acompanhamento automático (follow-up) [decidido]

A Íris envia sozinha, com os textos do kit no tom B:
- **Véspera da consulta:** confirmação de dia, hora e endereço.
- **Falta:** mensagem no mesmo dia ("senti sua falta…", sem cobrança) e outra 3 dias depois. Sem resposta, para, e a paciente fica em acompanhamento.
- **Pós-procedimento:**
  - no dia seguinte, perguntando como ela está;
  - depois de 7 dias, sobre o resultado;
  - entre 15 e 30 dias, pedindo um comentário sobre a experiência e lembrando o retorno.
  - **Foto de resultado só com autorização assinada; a Íris nunca pede.**

**Gatilhos [nossa decisão]:**
- A Agenda ganha o status **"faltou"**, além de agendado, confirmado, realizado e cancelado.
- **Falta:** dispara quando o agendamento é marcado "faltou".
- **Pós-procedimento:** dispara quando um agendamento **que não é avaliação** é marcado "realizado".
- **Quem marca:** a Rosi ou a Dra., na Agenda. Agendamentos de hoje que passaram do horário sem status aparecem no fim do dia em "Precisa de atenção", com o pedido "marcar comparecimento".
- **Abrangência:** vale para todos os agendamentos criados a partir do lançamento da Íris (manuais ou dela), sem retroativo para dados importados.

**Quadro "Retorno de mensagens"**, um Kanban separado para a Rosi enxergar **quem não respondeu** e **quem precisa de atenção**:
1. **Enviadas hoje**, só para conferência.
2. **Sem resposta:** sem resposta há mais de 24h **[nossa decisão sobre o prazo]**, mostrando há quanto tempo.
3. **Precisa de atenção:** queixa, dúvida, insatisfação ou pedido que a Íris não resolve. Fica em destaque. Casos urgentes também disparam o alerta da seção 4.
4. **Resolvido:** respondeu e está bem, ou a Rosi tratou. Some depois de alguns dias.

**[nossa decisão]** As confirmações de véspera e o roteiro de falta entram nesse mesmo quadro; quem não confirmou a consulta de amanhã aparece em "Sem resposta" logo cedo. O quadro mostra um contador no menu lateral.

Fora do horário de expediente, mensagens automáticas de follow-up **[nossa decisão]** saem só entre 9h e 20h, para não incomodar a paciente; as respostas da Íris às mensagens da paciente continuam 24/7.

---

## 8. Tela de conversas da Rosi (computador) [decidido, com mockup aprovado]

A Rosi trabalha **no computador**. Layout em três colunas:
- **Esquerda, lista de conversas:**
  - busca;
  - filtros **"Precisa de mim"** (padrão), "Íris atendendo", "Aguardando Dra." e "Todas";
  - cada conversa com uma etiqueta de situação: "Rascunho para aprovar", "🚨 Urgente · Dra. avisada", "Íris atendendo", "⏳ Aguardando pagamento N min", "✅ Agendou · pago".
- **Centro, a conversa:**
  - mensagens da Íris marcadas, com a marca visível só para a equipe;
  - no modo supervisionado, o rascunho com **Enviar / Editar / Eu respondo**;
  - botão **"Assumir conversa"** e campo para escrever como Rosi, que pausa a Íris.
- **Direita, resumo da paciente**, preenchido pela Íris:
  - etapa do funil e etiquetas;
  - **qualificação**, as 3 perguntas do kit: o que quer melhorar, se já fez algo e quando, se quer resolver agora ou está pesquisando;
  - origem (post, vídeo ou anúncio);
  - agenda e pagamento;
  - botões "Abrir ficha completa" e "Enviar para Dra.".

**Áudio e imagem:**
- **Áudio** da paciente é transcrito para texto e respondido em texto. A transcrição fica visível na conversa para a equipe.
- **Imagens e PDFs** são lidos pela Íris: comprovante, print, pedido médico. Pedido médico ou exame vai para a Dra., sem interpretação.
- **Foto do rosto ou da pele pedindo avaliação ("o que eu faço aqui?"):** a Íris **não avalia**. Oferece a avaliação presencial e etiqueta para a Dra. ver.
- Vídeos e figurinhas: a Íris pede que a paciente escreva ou mande áudio.

---

### Quem entra no app [nossa decisão]
Nesta versão, Rosi e Dra. usam **a mesma conta do consultório** (como hoje). Mensagens escritas pelo app aparecem para a paciente como vindas do consultório, e para a equipe como "Equipe". Logins separados (Rosi × Dra., com registro de quem fez o quê) ficam para depois.

## 9. Restrições

- **WhatsApp Cloud API oficial (Meta):**
  - conta Meta Business verificada;
  - número dedicado à API (ver "em aberto");
  - janela de 24h para mensagens livres;
  - fora da janela, só **templates aprovados**: confirmação de véspera, falta, pós-procedimento e alerta urgente para a Dra.
  - Webhook de mensagens recebidas no nosso backend.
- **Backend:** as chaves (Meta, Anthropic, transcrição) **nunca vão para o frontend**. O caminho planejado é Supabase Edge Functions (Deno/TypeScript) com `pg_cron` para os envios agendados e as expirações de reserva de 30 min. O builder precisa de acesso de deploy ao projeto Supabase do app, que hoje não está conectado às ferramentas do construtor.
- **Supabase precisa ficar sempre ligado.** A Íris atende 24/7, e o plano gratuito pausa após 7 dias sem uso. Recomendação firme: **plano Pro** (cerca de US$ 25 por mês).
- **Modelo de IA:** Claude Opus 5.5 (`claude-opus-5-5`, modelo padrão atual da Anthropic), com uso de ferramentas (consultar horários, segurar e reservar horário, gerar link de pagamento, etiquetar e mover card, passar para a Dra.) e cache das instruções fixas (kit, manual e regras). A Anthropic não processa áudio: é preciso um serviço de transcrição em português (o builder escolhe).
- **Google Agenda [decidido: na primeira versão]:** a sincronização atual é só no navegador. A Íris precisa de **autorização de servidor** (OAuth com refresh token) da conta Google da Dra., dada uma vez por um botão "Conectar Google Agenda à Íris" na tela de configurações da Íris. Com ela, o servidor:
  - consulta os horários ocupados (free/busy) do Google antes de oferecer horários;
  - cria, altera e cancela o evento no Google na hora em que reserva, remarca ou cancela.
  O refresh token fica só no servidor. **Atenção:** com o app do Google em status "Teste", o Google expira o refresh token em 7 dias. O app precisa passar para **"Em produção" no Google Cloud** — isso **não é** a verificação do Google (que segue dispensada); o aviso "Google não verificou este app" continua aparecendo uma vez, como hoje. Se a conexão cair, a Íris volta a usar só a agenda do ClinicFinance e a tela de configurações mostra "Reconectar Google Agenda".
- **LGPD:** dados de saúde. Aviso de privacidade com a menção à IA; mínimo de dados; acesso só da equipe; log das conversas na conta da clínica.
- **Custos estimados por mês:** IA de US$ 30 a 75 (cerca de 300 conversas); transcrição de US$ 1 a 5; Supabase Pro US$ 25; templates WhatsApp, centavos por mensagem; taxas InfinitePay, as da conta da clínica.

---

## 10. Em aberto (só o cliente responde)

1. **Número de WhatsApp.** A Íris atende no **número atual** da clínica, o que as pacientes já usam no Instagram e nos anúncios, ou num **número novo** dedicado à API? Muda a migração, se a Rosi continua usando o app do WhatsApp nesse número, e a divulgação.
2. **Campos "A PREENCHER" do kit:** endereço; o que a Íris nunca deve dizer; política de cancelamento e de atraso.
3. **Textos do manual** de cada procedimento: rascunho nosso, aprovação da Dra.
4. **Frase de emergência** para sinais graves: aval da Dra.
5. **InfiniteTag** da clínica, para gerar os links de pagamento.
6. **Conta Anthropic** com créditos, conta Meta Business verificada e **plano Supabase**.

## 11. Deixado para o construtor

- Modelo de dados das conversas, mensagens, reservas temporárias, promoções, manual e fila de follow-ups.
- Escolha do serviço de transcrição de áudio.
- Arquitetura exata das Edge Functions, filas e reprocessamento de webhooks.
- Detalhes visuais das novas telas (Conversas, Manual da Íris, Promoções ativas, Retorno de mensagens), seguindo o Design 2.0 do app e o mockup aprovado da tela de conversas.
- Estratégia de testes, incluindo um conjunto de conversas-teste com respostas esperadas para validar a Íris antes de ligar o modo automático.
- Ordem de entrega, respeitando: inbox e tela de conversas → reserva e pagamento → follow-ups e quadro de retorno → modo supervisionado → modo automático.
