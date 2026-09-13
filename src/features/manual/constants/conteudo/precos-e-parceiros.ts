import type { CapituloManual } from '../../types/manual'

/** Preços, assinaturas e Programa de Parceiros. */
export const CAPITULOS_PRECOS_E_PARCEIROS: CapituloManual[] = [
  {
    id: 'precificacao',
    titulo: 'Precificação',
    parte: 'Como as coisas funcionam',
    resumo: 'Os planos da Vincis, a tabela de preços de cada Profissional e as assinaturas.',
    blocos: [
      { tipo: 'paragrafo', texto: 'Existem duas tabelas de preço diferentes, e é importante não confundir: a **dos planos da Vincis** (definida pelo Gestor) e a **de cada Profissional** (definida por ele, usando a da Vincis como modelo).' },
      {
        tipo: 'ficha',
        titulo: 'Página Preços (planos da Vincis)',
        situacao: 'parcial',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Qualquer visitante simula; só Cliente (ou Gestor) contrata' },
          { rotulo: 'Planos', conteudo: 'Contabilidade Padrão · Contabilidade Consultiva · Assistência Jurídica · Pacote Empresarial Completo (Consultiva + Jurídica com desconto).' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Escolhe o tipo de serviço.', 'Responde: enquadramento fiscal (MEI, Simples, Presumido, Real), ramo, quem emite as notas, quantidade de notas, faturamento, funcionários, forma de atendimento, quem cuida da rotina e adicionais.', 'Vê o preço mensal, a composição do valor e o preço com desconto em 6 e 12 meses.', 'Clica em Contratar (entra, se necessário) e confirma.'] },
          { rotulo: 'Como o preço é montado', conteudo: 'Preço-base do regime × fator do plano → soma funcionários acima de 2, faixa de notas (só quando a Vincis emite) e faixa de faturamento → aplica os acréscimos de ramo, atendimento e rotina → soma os adicionais → arredonda. O Jurídico não cobra notas nem faturamento.' },
          { rotulo: 'Resultado', conteudo: '“Contratação registrada. O pagamento ainda não está disponível neste ambiente.” Nada é cobrado e o Cliente não tem tela para acompanhar essa contratação.' },
          { rotulo: 'Regra', conteudo: 'Se a configuração da Precificação estiver incoerente, a página mostra um aviso comercial de indisponibilidade em vez de um preço errado.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Meus preços (tabela do Profissional)',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Profissional aprovado ou Colaborador' },
          { rotulo: 'Onde', conteudo: 'Painel → Meus preços' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Parte da mesma estrutura da tabela da Vincis.', 'Define os próprios valores e acréscimos — em porcentagem ou em reais.', 'Salva como rascunho (o público não vê) e confere a prévia.', 'Publica. O perfil passa a mostrar “Ver planos e preços”.', 'Pode despublicar a qualquer momento sem perder o que fez.'] },
          { rotulo: 'Regras', conteudo: 'A tabela precisa estar completa, e nenhuma combinação pode dar preço zero. Sem tabela publicada, a página de planos do Profissional mostra “Este profissional ainda não publicou uma tabela de preços” e leva de volta ao perfil.' },
        ],
      },
      { tipo: 'subtitulo', texto: 'Assinaturas dos planos Vincis' },
      {
        tipo: 'ficha',
        titulo: 'Contrato de plano',
        situacao: 'parcial',
        campos: [
          { rotulo: 'O que já existe', conteudo: ['A contratação na página Preços cria um contrato “Aguardando pagamento”, com o preço e as respostas congeladas.', 'Prazos: mensal, 6 meses ou 12 meses. Os meses do contrato são organizados um a um.', 'Repetir o mesmo clique não cria contrato duplicado.'] },
          { rotulo: 'O que ainda não existe', conteudo: ['Cobrança real (cartão, PIX, boleto, recorrência automática).', 'Tela para o Cliente ver, pagar ou cancelar a assinatura.', 'Tela para o Gestor acompanhar assinaturas.', 'Cancelamento, reembolso, nota fiscal e atendimento vinculado ao plano.'] },
          { rotulo: 'Em homologação', conteudo: 'A equipe técnica consegue confirmar manualmente um pagamento de teste e marcar meses como prestados. Isso ativa o contrato e movimenta a comissão recorrente do parceiro. Não há botão para isso na plataforma.' },
        ],
      },
      { tipo: 'paragrafo', texto: 'A tabela dos planos da Vincis é editada pelo Gestor em Central Vincis → Precificação (ver capítulo Gestão Vincis).' },
    ],
  },
  {
    id: 'parceiros',
    titulo: 'Parceiros',
    parte: 'Como as coisas funcionam',
    resumo: 'Link de indicação, leads, comissões, níveis, saques e as seções que ainda são demonstração.',
    blocos: [
      { tipo: 'paragrafo', texto: 'Qualquer Cliente pode indicar pessoas à Vincis com um link próprio e ganhar comissão sobre o que essas pessoas contratarem.' },
      {
        tipo: 'ficha',
        titulo: 'Ativar e divulgar o link',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Cliente (e Gestor), pela Área do Cliente' },
          { rotulo: 'Onde', conteudo: 'Área do Cliente → Parceiros → Dashboard (ativar) e → Meu link' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Clica para ativar. Não há análise: ativa na hora.', 'Recebe um link no formato /p/CÓDIGO.', 'Em Meu link, escolhe o destino: página inicial ou o perfil de um Profissional.', 'No perfil público de um Profissional, o botão Compartilhar de um parceiro já usa o link dele.'] },
          { rotulo: 'Como a indicação é reconhecida', conteudo: ['Quem clica é lembrado naquele navegador por 90 dias.', 'Se criar a conta depois do clique, a conta fica ligada ao parceiro **para sempre**. Clicar depois no link de outro parceiro não muda a origem.', 'Quem já tinha conta antes do clique não é contado como indicação.', 'Código inválido leva para a home sem registrar nada.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Leads e indicações',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Onde', conteudo: 'Parceiros → Leads' },
          { rotulo: 'O que mostra', conteudo: 'A jornada de cada pessoa indicada: acessou o link, criou conta, pediu orçamento, contratou — com o prazo de validade de cada negócio (dias restantes, expirada).' },
          { rotulo: 'Prazo', conteudo: 'Cada negócio atribuído ao parceiro vale pelo prazo configurado pela Gestão no momento em que nasceu (padrão 30 dias; pode ser diferente para Contabilidade e Jurídico).' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Comissões',
        situacao: 'parcial',
        campos: [
          { rotulo: 'Onde', conteudo: 'Parceiros → Comissões' },
          { rotulo: 'Comissão avulsa', conteudo: '**10% fixo** sobre **serviços do perfil contratados** por quem o parceiro indicou, quando o serviço tem valor. Nasce como **Gerada**, fica **Disponível** quando o Atendimento é concluído e vira **Cancelada** se a contratação for cancelada antes.' },
          { rotulo: 'Comissão recorrente', conteudo: 'Percentual do nível do parceiro sobre cada mês de **plano Vincis** que foi pago e prestado. Só vale para a primeira assinatura ativada da pessoa indicada. Hoje só acontece em testes de homologação, porque assinaturas ainda não são cobradas.' },
          { rotulo: 'Não geram comissão', conteudo: 'Pedidos de orçamento (mesmo pagos) e o fluxo “Tenho interesse” aparecem nos Leads, mas não geram valor. Consultorias agendadas não são ligadas ao parceiro.' },
          { rotulo: 'Atenção', conteudo: 'Nesta tela, o bloco “método de recebimento” (ex.: “PIX · CPF ****4821”) e o prazo de “3 dias úteis” são **de demonstração**. Os dados reais de recebimento ficam em Parceiros → Configurações.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Níveis',
        situacao: 'parcial',
        campos: [
          { rotulo: 'Como funciona', conteudo: 'Bronze, Prata e Ouro. O nível sobe na hora quando o parceiro atinge o mínimo de clientes com plano Vincis ativo e pago, e ganha dias de proteção. Só cai depois que a proteção termina. Tudo é configurado pela Gestão.' },
          { rotulo: 'Limitação', conteudo: 'Como os planos ainda não são cobrados, na prática todos os parceiros ficam no nível inicial fora dos testes.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Saque e recebimento',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Parceiro cadastra a chave PIX em Parceiros → Configurações.', 'Em Comissões, pede o saque do saldo disponível.', 'O Gestor vê o pedido em Central Vincis → Parceiros → Saques, faz o PIX pelo banco e clica em **Marcar como pago** — ou **Recusa**, devolvendo o valor ao saldo.'] },
          { rotulo: 'Regras', conteudo: 'A plataforma não transfere dinheiro. O mesmo valor não entra em dois saques. A chave PIX aparece mascarada para o Gestor, que pode revelá-la.' },
        ],
      },
      { tipo: 'subtitulo', texto: 'Seções que ainda são demonstração' },
      {
        tipo: 'tabela',
        colunas: ['Seção', 'Situação'],
        linhas: [
          ['Dashboard (exceto o link de indicação e o nível)', { situacao: 'visual' }],
          ['Meu link · Leads · Comissões (exceto método de recebimento) · Configurações', { situacao: 'pronto' }],
          ['Níveis e benefícios', { situacao: 'parcial' }],
          ['Clientes indicados (cartões “em preparo” e funil de exemplo)', { situacao: 'parcial' }],
          ['Cupons · Materiais · Campanhas · Ranking · Comunidade · Academia', { situacao: 'visual' }],
        ],
      },
    ],
  },
]
