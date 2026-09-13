import type { CapituloManual } from '../../types/manual'

/** Administração e avisos: Central Vincis, notificações e pagamentos. */
export const CAPITULOS_ADMINISTRACAO: CapituloManual[] = [
  {
    id: 'gestao-vincis',
    titulo: 'Gestão Vincis',
    parte: 'Administração e avisos',
    resumo: 'Os módulos da Central Vincis e quem pode fazer o quê na plataforma.',
    blocos: [
      { tipo: 'paragrafo', texto: 'A Central Vincis é a área exclusiva do Gestor, dentro do painel. Tem seis módulos na navegação interna. Ninguém além do Gestor abre essas telas, nem digitando o endereço. Este Manual também é exclusivo do Gestor.' },
      {
        tipo: 'ficha',
        titulo: 'Visão geral',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Onde', conteudo: 'Central Vincis (primeira tela)' },
          { rotulo: 'O que faz', conteudo: 'Mostra quantos cadastros de Profissional esperam análise, atalhos para os módulos e o cartão **Prazo das oportunidades**: quantas horas um pedido de orçamento público fica aberto (padrão 48 h, de 1 a 720 h).' },
          { rotulo: 'Regra', conteudo: 'Mudar o prazo vale só para pedidos criados depois da mudança.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Usuários',
        situacao: 'pronto',
        campos: [
          { rotulo: 'O que faz', conteudo: ['Lista todas as contas, com busca (nome, e-mail ou WhatsApp) e filtros por perfil, área profissional, modalidade, situação da conta e verificação.', 'Abre o cadastro de um Profissional, mostra o comprovante de registro e permite **Aprovar**, **Solicitar correção** ou **Rejeitar** (as duas últimas com mensagem).', '**Confirmar via WhatsApp** a conta de quem não recebeu o e-mail.', '**Desativar** (bloqueia o login) e **Reativar**.', '**Excluir** definitivamente.'] },
          { rotulo: 'Regras da exclusão', conteudo: 'Não é possível excluir a própria conta, contas de Gestor, nem contas ligadas a escritório — essas devem ser desativadas. A exclusão não pode ser desfeita.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Comunicados',
        situacao: 'parcial',
        campos: [
          { rotulo: 'O que faz', conteudo: 'Criar comunicados institucionais com tipo (Novidade, Aviso, Manutenção, Sistema, Destaque), público (Todos, Prestadores, Clientes), data de publicação e situação (Rascunho, Publicado, Arquivado).' },
          { rotulo: 'Onde aparece', conteudo: 'No mural do Dashboard do Painel do Profissional.' },
          { rotulo: 'O que falta', conteudo: '**Clientes não veem comunicados em lugar nenhum**: a Área do Cliente não tem mural. Um comunicado para “Clientes” fica publicado sem ser exibido. Comunicados também não geram e-mail nem notificação.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Consultorias',
        situacao: 'parcial',
        campos: [
          { rotulo: 'O que faz', conteudo: 'Acompanhar todas as consultorias da plataforma: indicadores, filtros por Profissional e situação, e detalhe de cada uma.' },
          { rotulo: 'O que falta', conteudo: 'É **somente consulta**. O Gestor não cancela, remarca nem conclui consultorias de outras pessoas.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Precificação',
        situacao: 'pronto',
        campos: [
          { rotulo: 'O que faz', conteudo: 'Edita, por seção, a tabela que alimenta a página Preços: preços-base por regime, faixas (funcionários, notas fiscais, faturamento), acréscimos (ramo, forma de atendimento, rotina), serviços adicionais e descontos (6 meses, 12 meses e pacote).' },
          { rotulo: 'Regras', conteudo: ['A tela recusa qualquer configuração que deixaria algum plano com preço zero ou impossível de calcular.', 'Se duas pessoas editarem ao mesmo tempo, a segunda é avisada para recarregar.', 'A mudança aparece na página Preços na visita seguinte.', 'Arredondamento do preço final e número inicial de funcionários existem como parâmetros, mas não aparecem para edição nesta tela.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Parceiros',
        situacao: 'pronto',
        campos: [
          { rotulo: 'O que faz', conteudo: ['**Níveis:** define para Bronze, Prata e Ouro o percentual de comissão recorrente, o mínimo de clientes recorrentes ativos e os dias de proteção.', '**Prazos:** por quantos dias uma indicação vale — um padrão (30 dias, se nunca alterado) e um prazo específico para Contabilidade e para Jurídico.', '**Saques:** lista pedidos de saque dos parceiros, com dados de recebimento; permite **Marcar como pago** ou **Recusar**.'] },
          { rotulo: 'Regras', conteudo: '“Marcar como pago” só registra: o Gestor faz o PIX por fora. Mudanças de nível e prazo valem daqui para a frente; o que já foi gerado mantém os números antigos.' },
        ],
      },
      { tipo: 'subtitulo', texto: 'Quem pode o quê' },
      {
        tipo: 'tabela',
        colunas: ['Ação', 'Cliente', 'Profissional / Colaborador', 'Participante convidado', 'Gestor'],
        linhas: [
          ['Pedir orçamento, contratar, agendar, assinar plano', 'Sim', 'Não', '—', 'Sim'],
          ['Enviar proposta, receber oportunidades', 'Não', 'Sim', '—', 'Se for prestador'],
          ['Mudar situação, prioridade, prazo, checklist', 'Não', 'Dono / responsável', 'Sim', 'Só nos próprios'],
          ['Concluir, aceitar ajuste, convidar, remover participante', 'Não', 'Dono / responsável', 'Não', 'Só nos próprios'],
          ['Conversa interna', 'Não vê', 'Sim', 'Sim', 'Só nos próprios'],
          ['Avaliar e pedir ajuste', 'Só o dono', 'Não', 'Não', 'Não'],
          ['Central Vincis e Manual da Vincis', 'Não', 'Não', 'Não', 'Sim'],
        ],
      },
      {
        tipo: 'aviso',
        nivel: 'atencao',
        titulo: 'O que o Gestor não vê',
        texto: 'O Gestor não vê nem mexe em Atendimentos, conversas ou consultorias de outras pessoas (as consultorias ele só consulta na Central). Para ajudar alguém com um Atendimento, peça o número do protocolo e uma captura de tela.',
      },
    ],
  },
  {
    id: 'notificacoes',
    titulo: 'Notificações',
    parte: 'Administração e avisos',
    resumo: 'Os quatro jeitos de a plataforma avisar alguém, e as diferenças entre Cliente e Profissional.',
    blocos: [
      { tipo: 'paragrafo', texto: 'A plataforma tem quatro jeitos de avisar alguém. Nenhum deles usa WhatsApp ou SMS.' },
      {
        tipo: 'tabela',
        colunas: ['Canal', 'Quem recebe', 'O que avisa', 'Situação'],
        linhas: [
          ['**Sino** (lista de notificações)', 'Só no Painel do Profissional', 'Mensagens, arquivos, Protocolo, mudança de situação, prazo próximo, conclusão, avaliação, ajustes, convites e negociação, oportunidades (nova, direta, respondida, expirada, contraproposta, aceite, pagamento), consultorias (agendada, cancelada, remarcada, lembrete, concluída). Clicar leva direto ao lugar certo; abrir o assunto apaga o aviso.', { situacao: 'parcial', texto: 'mistura exemplos' }],
          ['**Aviso na tela em tempo real**', 'Qualquer pessoa logada, com a plataforma aberta', 'Pequenos avisos no canto da tela e atualização automática de quadro, conversa e listas.', { situacao: 'pronto' }],
          ['**E-mail**', 'Qualquer conta', 'Só dois: confirmação de conta e recuperação de senha.', { situacao: 'pronto' }],
          ['**Mural de comunicados**', 'Só Dashboard do Profissional', 'Comunicados publicados pelo Gestor.', { situacao: 'parcial' }],
        ],
      },
      {
        tipo: 'aviso',
        nivel: 'critico',
        titulo: 'Diferença entre Cliente e Profissional',
        itens: ['O **Profissional** tem sino e mural de comunicados no painel.', 'O **Cliente não tem sino nem mural**: avisos dirigidos a ele só aparecem em tempo real, se estiver com a plataforma aberta. Fora isso, ele descobre as novidades abrindo a Área do Cliente.', 'O sino do Profissional mistura notificações de exemplo, que nunca somem, às reais.', 'O Profissional **não é avisado** da aprovação, correção ou rejeição do cadastro.'],
      },
      { tipo: 'subtitulo', texto: 'Regras gerais' },
      {
        tipo: 'lista',
        itens: ['Ninguém é avisado da própria ação.', 'Notas internas da equipe nunca geram aviso para o Cliente.', 'Avisos que dependem do relógio (pedido expirado, convite vencido, prazo próximo, lembretes) são disparados por uma rotina automática que hoje roda **uma vez por dia**.'],
      },
    ],
  },
  {
    id: 'pagamentos',
    titulo: 'Pagamentos',
    parte: 'Administração e avisos',
    resumo: 'O que é real, o que é simulado e o que ainda não existe.',
    blocos: [
      {
        tipo: 'aviso',
        nivel: 'critico',
        titulo: 'Pagamentos ainda não são reais',
        texto: 'Nenhum pagamento da Vincis movimenta dinheiro. Onde há pagamento, ele é uma simulação identificada, com referência que começa com SIM-. A plataforma nunca pede número de cartão, código de segurança ou chave PIX para pagar — se um usuário relatar esse pedido, não veio da Vincis.',
      },
      {
        tipo: 'tabela',
        colunas: ['Onde', 'Como está', 'Situação'],
        linhas: [
          ['Pagamento de acordo de pedido de orçamento', 'Botão de simulação; aprova sempre; gera referência SIM- e cria o Atendimento.', { situacao: 'simulado' }],
          ['Pagamento de consultoria agendada', 'Botão de simulação, com opção de simular recusa; confirma a consulta.', { situacao: 'simulado' }],
          ['Contratação de serviço do perfil', 'Não existe etapa de pagamento.', 'Não existe'],
          ['Plano Vincis', 'Registra o contrato; cobrança não disponível. Confirmação só manual, em homologação, pela equipe técnica.', { situacao: 'parcial' }],
          ['Valor combinado entre prestadores (convite)', 'Só registro; nada é cobrado ou repassado.', 'Não existe'],
          ['Saque de parceiro', 'Registro real do pedido e da decisão; o dinheiro é enviado pelo Gestor fora da plataforma.', { situacao: 'pronto', texto: 'manual' }],
          ['Estorno, reembolso, divisão de valores com o prestador, repasse, nota fiscal, cartão, PIX, boleto', 'Não existem.', 'Não existe'],
          ['Tela Financeiro do Painel', 'Números fictícios.', { situacao: 'visual' }],
        ],
      },
    ],
  },
]
