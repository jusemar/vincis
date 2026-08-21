# Oportunidade até Atendimento — resumo da etapa

Fechamento do fluxo funcional: solicitação pública → proposta → acordo →
pagamento **simulado** → Atendimento real com protocolo.

Data: 20/08/2026 · Branch: `main`

---

## Status

Concluído.

## Acordo

Os dois caminhos passam pelo mesmo `fecharAcordoComercial` — aceitar proposta
direta e aceitar contraproposta agora encerram a solicitação, tiram-na do
banner/vitrine dos concorrentes, bloqueiam novas propostas e resolvem as
contrapropostas pendentes. Nada é apagado.

Um dado legado ficou nesse estado inconsistente no banco de desenvolvimento;
corrigido por `scripts/desenvolvimento/corrigir-oportunidades-com-acordo.ts`
(idempotente, só `status`/`encerrada_em`, carimbo com a data real do aceite).

## Proposta

- "Sua apresentação" → **Mensagem da proposta** (texto de apoio agora fala em
  como pretende atender).
- Limite 1.500 → **500** em UI, `maxLength`, contador `0 / 500`, Zod, Server
  Action e testes.
- Propostas antigas acima de 500 não foram migradas nem truncadas — seguem
  íntegras na leitura; só uma revisão passa pela validação nova.
- Valor e prazo continuam opcionais ("a combinar") e a validade comercial ficou
  como estava.

## Elegibilidade

`obterVinculoComOportunidade` é a fonte única (vitrine, sino, detalhes, anexos,
proposta, dispensa). Dois reforços:

1. Termos genéricos do Colaborador foram trocados por inequívocos
   (`depart` → `departamento pessoal`, `process` → `contencioso`/`litig`) — os
   dados de teste TI/Marketing não alcançam Contabilidade.
2. Fechado o acordo, só o vencedor mantém acesso: o concorrente perde a
   solicitação e os anexos, por UI e por chamada direta.

## Pagamento

Simulador interno explícito (`src/features/pagamentos`), sem gateway e sem
coletar cartão/CVV/PIX — a tabela não tem colunas para isso. Toda linha nasce
`origem = 'simulado'` com referência `SIM-AAAA-XXXXXXXX`.

Idempotência garantida por banco em dois índices únicos
(`oportunidade_pagamentos_unico`, `atendimentos_oportunidade_unico`): duplo
clique, F5, duas abas e chamadas concorrentes convergem para um pagamento e um
protocolo, sem erro.

## Atendimento

Criado só após aprovação, reusando a arquitetura existente — mesmo
`reservarProtocolo` (`#2026-00XX`), participantes, eventos, auditoria, Kanban e
autorização. Leva cliente, prestador, categoria traduzida
(`contabilidade` → `contabil`), valor e prazo acordados, descrição da
solicitação como primeira manifestação do Protocolo e os anexos por
**referência** ao mesmo objeto no storage.

Vínculo em `atendimentos.oportunidade_id` (único), navegável nos dois sentidos.

## Dados provisórios

- **Pagamento inteiro é simulado** — substituir pelo gateway real; a fronteira
  (quem pode pagar, o que produz, como não duplicar) já está pronta.
- **Acordo "a combinar"**: o Cliente informa o valor na própria tela de
  pagamento, validado `> 0` e rotulado como provisório. Sai quando existir a
  etapa real de definição de preço.
- Sem catálogo por trás, o Atendimento nasce **sem checklist** e sem
  `contratacao_id` — comportamento correto, não mock.
- Limite de 5 anexos segue provisório (herdado da etapa anterior).
- Nenhum dado sensível, documento ou CPF/CNPJ foi inventado.

## Banco

Uma migration nova e incremental —
`0033_oportunidade_pagamento_e_atendimento`:

- tabela `oportunidade_pagamentos` com FKs, dois índices únicos, dois de
  consulta e `check valor_centavos > 0`;
- coluna `atendimentos.oportunidade_id` + índice único.

Migrations 0028–0032 intactas; nada resetado ou apagado.

## Validação

- 704 testes em 30 arquivos (23 novos cobrindo elegibilidade, acordo,
  pagamento, idempotência/concorrência e Atendimento).
- Typecheck limpo; lint direcionado limpo; build OK.
- Jornada real no navegador com o banco de desenvolvimento e contas demo, nos
  dois caminhos: contraproposta aceita → pagamento → **#2026-0012**; aceite
  direto → **#2026-0013** e **#2026-0014**.
- Conferidos claro/escuro (Sol/Lua), desktop 1440 e mobile 390, refresh sem
  duplicar, prestador vencedor vendo "aguardando pagamento" e depois o
  protocolo no Kanban, e concorrente sem acesso a pagamento, valor ou
  protocolo.

## Git

Branch `main`, apenas leitura (`git branch --show-current`, `git status`).
Nenhum comando de escrita. Nada de `.next/`, `tsbuildinfo` ou cache rastreado
(0 ocorrências em `git ls-files`). Scripts temporários da validação removidos.

## Pendências

- Integração real de pagamento e o que vem com ela: PIX/cartão/boleto, split,
  comissão, estorno, nota fiscal, repasse.
- Etapa de definição de preço para acordos "a combinar".
- Ainda não existe agendador — a expiração continua materializada nas leituras.

---

**Resultado:** CONCLUÍDO — pronto para teste manual.
