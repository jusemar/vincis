import type { CapituloManual } from '../../types/manual'

/** Primeiros passos: para que serve o manual e o que é a Vincis. */
export const CAPITULOS_PRIMEIROS_PASSOS: CapituloManual[] = [
  {
    id: 'comece-por-aqui',
    titulo: 'Comece por aqui',
    parte: 'Primeiros passos',
    resumo: 'Para que serve este manual, como ler as situações dos recursos e o que é preciso saber antes de tudo.',
    blocos: [
      { tipo: 'paragrafo', texto: 'Este manual explica como a Vincis funciona hoje, do ponto de vista de quem usa: o que cada pessoa vê, onde clica, o que acontece depois e quais regras valem. Tudo aqui foi conferido na plataforma atual (levantamento de 13 de setembro de 2026). Onde algo aparece na tela mas ainda não funciona de verdade, isso está dito com todas as letras.' },
      { tipo: 'subtitulo', texto: 'Para que serve este manual' },
      {
        tipo: 'lista',
        ordenada: true,
        itens: [
          '**Aprender como a Vincis funciona** — o que a plataforma faz e como as partes se ligam.',
          '**Aprender como cada tipo de usuário usa a plataforma** — Cliente, Profissional, Colaborador, Parceiro e Gestor.',
          '**Testar as funcionalidades** — com uma lista do que conferir, no capítulo “Como testar a plataforma”.',
          '**Identificar quando algo está funcionando incorretamente** — separando defeito de limitação conhecida.',
          '**Ajudar usuários que tiverem dúvidas ou problemas** — com roteiro de atendimento e respostas para as dúvidas mais comuns.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Como ler a situação de cada recurso' },
      {
        tipo: 'tabela',
        colunas: ['Situação', 'O que significa'],
        linhas: [
          [{ situacao: 'pronto' }, 'Deve funcionar normalmente, de ponta a ponta.'],
          [{ situacao: 'parcial' }, 'Existe, mas ainda possui partes em desenvolvimento.'],
          [{ situacao: 'simulado' }, 'O fluxo funciona para testes, mas não representa uma operação real, como pagamento real.'],
          [{ situacao: 'visual' }, 'Aparece na interface, mas ainda não possui funcionamento real.'],
        ],
      },
      {
        tipo: 'aviso',
        nivel: 'critico',
        titulo: 'Antes de tudo: o que mais gera confusão hoje',
        itens: [
          '**Nenhum pagamento é real.** Todo pagamento é uma simulação identificada, com referência que começa com SIM-.',
          '**Várias telas mostram dados fictícios:** Mensagens, Financeiro e Conquistas do Painel do Profissional, parte do Dashboard, notificações de exemplo no sino, o botão “Novo atendimento” e várias seções de Parceiros.',
          '**O Cliente não tem sino de notificações** e não vê comunicados. Só o Profissional tem sino e mural.',
          '**O Profissional não é avisado** quando o cadastro dele é aprovado, recusado ou precisa de correção — ele só descobre ao entrar.',
          '**Lembretes de consultoria de 1 hora e 10 minutos não chegam a tempo**, porque a rotina automática roda uma vez por dia.',
          '**A página pública de Suporte tem respostas incorretas** sobre formas de pagamento, reembolso, troca de profissional, troca de plano e exclusão de conta.',
        ],
      },
      {
        tipo: 'aviso',
        nivel: 'dica',
        titulo: 'Como usar este manual',
        itens: [
          'Leia na ordem se você nunca usou a Vincis: os capítulos vão do geral para o detalhe.',
          'Use a busca no topo para achar um assunto específico (por exemplo, “saque”, “protocolo” ou “senha”).',
          'Os capítulos de Testes e Suporte, no final, foram feitos para consulta no dia a dia.',
        ],
      },
    ],
  },
  {
    id: 'o-que-e-a-vincis',
    titulo: 'O que é a Vincis',
    parte: 'Primeiros passos',
    resumo: 'A ideia da plataforma em uma página.',
    blocos: [
      { tipo: 'paragrafo', texto: 'A Vincis conecta empresas e pessoas (**Clientes**) a contadores, advogados e especialistas (**Prestadores**). Todo trabalho contratado vira um **Atendimento** com número de protocolo, onde as duas partes conversam, trocam arquivos e acompanham o andamento.' },
      { tipo: 'paragrafo', texto: 'Além disso, o Cliente pode **contratar um plano da própria Vincis** (página Preços). Hoje isso só registra o pedido — a cobrança ainda não existe. E qualquer Cliente pode virar **Parceiro** e ganhar comissão por indicar pessoas.' },
      {
        tipo: 'aviso',
        nivel: 'critico',
        titulo: 'O que dizer quando perguntarem “já cobra de verdade?”',
        texto: 'Não. Nenhum pagamento da plataforma movimenta dinheiro hoje. Todo pagamento é uma simulação identificada como tal, com referência que começa com SIM-.',
      },
    ],
  },
  {
    id: 'objetivo-da-plataforma',
    titulo: 'Objetivo da plataforma',
    parte: 'Primeiros passos',
    resumo: 'Os cinco caminhos pelos quais um Cliente chega a um Prestador.',
    blocos: [
      { tipo: 'paragrafo', texto: 'O objetivo da Vincis é levar o Cliente até o prestador certo e organizar o trabalho depois da contratação. Hoje existem **cinco caminhos** para isso:' },
      {
        tipo: 'tabela',
        colunas: ['Caminho', 'Onde começa', 'Como termina', 'Situação'],
        linhas: [
          ['**Pedido de orçamento público**', 'Página Profissionais', 'Vários prestadores enviam proposta → Cliente aceita → paga (simulado) → Atendimento', { situacao: 'simulado' }],
          ['**Pedido de orçamento direto**', 'Perfil de um Profissional', 'Só aquele Profissional responde → mesmo caminho acima', { situacao: 'simulado' }],
          ['**Contratar serviço do perfil**', 'Lista de serviços no perfil do Profissional', 'Atendimento criado na hora, sem etapa de pagamento', { situacao: 'parcial' }],
          ['**Consultoria agendada**', 'Calendário no perfil do Profissional', 'Escolhe horário → paga (simulado) → Atendimento com videochamada', { situacao: 'simulado' }],
          ['**“Tenho interesse” nos preços do Profissional**', 'Página de planos e preços do Profissional', 'Abre uma conversa direta; o combinado final acontece fora da plataforma', { situacao: 'pronto' }],
        ],
      },
      { tipo: 'paragrafo', texto: 'Com exceção do “Tenho interesse”, todos os caminhos terminam no mesmo lugar: o **Atendimento**, com protocolo, conversa, arquivos e histórico.' },
    ],
  },
  {
    id: 'mapa-da-plataforma',
    titulo: 'Mapa da plataforma',
    parte: 'Primeiros passos',
    resumo: 'Todas as áreas da Vincis e o que existe dentro de cada uma.',
    blocos: [
      {
        tipo: 'mapa',
        ramos: [
          { titulo: 'Site público', itens: ['Início · Profissionais · Parceiros · Como funciona · Preços · Suporte', 'Perfil do Profissional → Serviços · Agenda · Pedido direto · Planos e preços', 'Criar conta · Entrar · Esqueci senha · Confirmar e-mail'] },
          { titulo: 'Cadastro de prestador', itens: ['Profissional (com análise da Vincis) · Colaborador (sem análise)'] },
          { titulo: 'Área do Cliente', itens: ['Visão geral · Orçamentos (propostas, pagar) · Atendimentos · Minha conta', 'Parceiros → Dashboard · Meu link · Leads · Comissões · Níveis · Configurações · (seções de demonstração)'] },
          { titulo: 'Painel do Profissional', itens: ['Dashboard · Clientes · Equipe · Agenda · Atendimentos · Oportunidades · Avaliações · Meus preços · Meu Perfil', 'De demonstração: Mensagens · Financeiro · Conquistas'] },
          { titulo: 'Central Vincis (só Gestor)', itens: ['Visão geral · Usuários · Comunicados · Consultorias · Precificação · Parceiros'] },
          { titulo: 'Manual da Vincis (só Gestor)', itens: ['Este manual de treinamento, testes e suporte'] },
        ],
      },
    ],
  },
]
