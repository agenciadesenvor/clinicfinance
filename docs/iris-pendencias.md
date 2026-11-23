# Íris — o que falta para ela funcionar

Situação em 23/11/2026: **pausada pelo Elison** até a chave da Anthropic estar resolvida.

## O que já está pronto

- Todo o código da fase 1 (simulador), revisado, com 170 testes passando.
- Banco: `iris.sql` rodado em produção, teste passou.
- As duas funções (`iris-chat` e `iris-pagamento`) publicadas no Supabase e testadas: recusam quem não está logado e quem não está na lista de e-mails autorizados (`IRIS_EMAILS`).
- Telas da Íris publicadas no app, com o item **"Íris" escondido no menu** até tudo ser testado.
- Primeira conversa real feita: o caminho inteiro funcionou (login, conversa, trava, banco). Ela parou só na hora de falar com a IA, e parou do jeito certo: não mandou nada para a "paciente" e deixou um aviso para a equipe.

## O que travou

A chave guardada como `ANTHROPIC_API_KEY` foi recusada pela Anthropic ("Invalid bearer token"). Não é uma chave de API válida.

## Para retomar — sua parte (Elison)

1. Entrar em **console.anthropic.com** com a conta da API que você já usa na agência.
2. Criar um **Workspace** só para a clínica (sugestão: "Clínica Íris"). Assim o gasto fica separado e dá para pôr um teto mensal.
3. Dentro dele, em **API Keys → Create Key**, criar a chave (nome sugerido: `iris-clinica`). Ela começa com `sk-ant-api03-`. Copiar inteira; ela só aparece uma vez.
4. Em **Billing**, conferir se há crédito e ligar a recarga automática. A conta é compartilhada com o sistema da agência: se o crédito acabar, os dois param.
5. No terminal, na pasta do projeto, rodar (trocando `SUA_CHAVE`) e escolher **Yes**:

   ```
   npx -y supabase secrets set ANTHROPIC_API_KEY=SUA_CHAVE
   ```

6. **Não colar a chave no chat.** Só avisar "feito".

## Para retomar — minha parte (Claude)

1. Repetir a conversa de teste duas vezes (`supabase/functions/_evals/fumaca.ts`) e conferir: resposta com "R$ 100", apresentação como Íris, sem se dizer "assistente virtual", e o reaproveitamento das instruções funcionando na segunda vez.
2. Medir o custo real por resposta e por conversa e mostrar ao Elison.
3. **Pedir autorização do gasto** antes de rodar as 20 conversas de teste (`_evals/rodar.ts`, 3 vezes cada). Ajustar só o texto de atendimento (`kit.ts`) se alguma falhar.
4. Testar no app, com a conta de teste, de ponta a ponta (simulador do celular da paciente, simular pagamento).
5. Mostrar o item "Íris" no menu e publicar.
6. Escrever o resumo das conversas de teste.

Registro detalhado das decisões técnicas: `.superpowers/sdd/2026-11-09-iris-fase-1-simulador/progress.md` (fora do git).

## Custo estimado (ainda não medido)

Com o modelo atual (Claude Opus 5.5), dólar a R$ 5,50:

| Situação | Custo estimado |
|---|---|
| Uma resposta, paciente respondendo rápido | ~R$ 0,10 |
| Uma resposta depois de uma pausa | ~R$ 0,35 |
| Resposta com consulta de agenda ou reserva | ~R$ 0,45 |
| Conversa completa até marcar a avaliação (~10 mensagens) | R$ 2 a R$ 4 |
| 100 conversas por mês | ~R$ 300 |
| 300 conversas por mês | ~R$ 800 |

Formas de baixar, a decidir depois de medir: guardar as instruções por 1 hora em vez de 5 minutos, ou um modelo mais barato (Sonnet custa metade, Haiku muito menos), comparando a qualidade nas conversas de teste.

## Antes de atender pacientes de verdade

- A Dra. revisar e aprovar os **14 itens do Manual** da Íris e preencher as informações práticas (endereço, estacionamento etc.).
- Decidir de quem é a conta da Anthropic quando a Íris atender pacientes reais (hoje seria a da agência).
- Se a Rosi tiver login próprio, passar o e-mail dela para entrar na lista `IRIS_EMAILS`.
- Próximas fases: pagamento real (InfinitePay), WhatsApp (conta Meta Business e número dedicado), lembretes e Google Agenda no servidor.
