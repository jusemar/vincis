import type { CapituloManual } from '../../types/manual'

/** Como as coisas funcionam: do pedido de orçamento à avaliação. */
export const CAPITULOS_FLUXOS: CapituloManual[] = [
  {
    id: 'oportunidades-e-orcamentos',
    titulo: 'Oportunidades e orçamentos',
    parte: 'Como as coisas funcionam',
    resumo: 'Como o Cliente pede orçamento, quem recebe e em que situações o pedido pode estar.',
    blocos: [
      { tipo: 'paragrafo', texto: 'Para o Cliente, é um “pedido de orçamento”. Para o prestador, uma “oportunidade”. É a etapa **antes** da contratação: ainda não há Atendimento nem protocolo.' },
      {
        tipo: 'ficha',
        titulo: 'Criar o pedido',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Cliente (e Gestor). Prestadores são recusados.' },
          { rotulo: 'Onde', conteudo: ['**Público:** página Profissionais → “Solicitar orçamento”.', '**Direto:** perfil de um Profissional → pedir orçamento a ele.'] },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Escolhe a categoria: **Contabilidade** ou **Jurídico – Advogado** (no pedido direto, só as categorias que aquele Profissional atende).', 'Descreve a necessidade (até 2.000 caracteres).', 'Escolhe a abrangência: BR (qualquer lugar do país) ou um estado.', 'Opcional: especialidades, valor pretendido e até 5 anexos.', 'Envia. Se não estiver logado, é convidado a entrar.'] },
          { rotulo: 'Resultado', conteudo: ['**Público:** todos os prestadores compatíveis recebem aviso e veem o pedido em Oportunidades.', '**Direto:** só o Profissional escolhido recebe, com o selo “Solicitação direta”. O Cliente vê quando ele abriu o pedido (“visualizada”).'] },
          { rotulo: 'Regras', conteudo: ['Contabilidade alcança contadores e especialistas fiscais; Jurídico alcança advogados; Colaboradores entram pelas palavras das suas áreas de atuação.', 'Não há ranking nem rodízio: todos os compatíveis veem, em ordem de chegada.', 'O pedido público fica aberto pelo prazo definido na Central (padrão 48 h). Depois, aparece como **Expirada**.', 'Anexos: PDF, JPG, PNG ou TXT, até 10 MB cada. O limite de 5 anexos é provisório.', 'O Cliente **não consegue cancelar** um pedido depois de enviado.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: '“Não tenho interesse”',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Prestador' },
          { rotulo: 'O que acontece', conteudo: ['**No pedido público:** o pedido sai só da lista daquele prestador; continua valendo para os outros.', '**No pedido direto:** o pedido é **encerrado** e o Cliente é avisado (“Sem interesse do profissional”). Para insistir, o Cliente precisa criar um pedido novo.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Pedido que nasce da simulação de preços (fluxo direto)',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Cliente e o Profissional escolhido' },
          { rotulo: 'Onde', conteudo: 'Perfil do Profissional → “Ver planos e preços” → “Tenho interesse”' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Cliente responde as perguntas do simulador e vê o preço daquele Profissional.', 'Clica em “Tenho interesse” (precisa estar logado).', 'Nasce um pedido direto marcado como “Simulação de preços”, com o retrato do que o Cliente respondeu e o preço exibido.', 'O Profissional clica em “Tenho interesse” do lado dele, e os dois conversam por mensagens dentro do pedido.'] },
          { rotulo: 'Regras', conteudo: ['**Não tem proposta, pagamento nem Atendimento.** O combinado final acontece fora da plataforma.', 'O preço guardado é só um retrato, não uma oferta.', 'Repetir o mesmo cenário em sequência não cria pedidos duplicados.', 'Com o pedido encerrado ou vencido, a conversa fica só para leitura.'] },
        ],
      },
      { tipo: 'subtitulo', texto: 'Situações que o Cliente vê num pedido' },
      {
        tipo: 'tabela',
        colunas: ['Rótulo', 'Significa'],
        linhas: [
          ['Aberta', 'Recebendo propostas.'],
          ['Aguardando pagamento', 'Houve acordo; falta o Cliente pagar.'],
          ['Pagamento aprovado', 'Pagamento simulado registrado.'],
          ['Atendimento criado', 'O trabalho começou; há protocolo.'],
          ['Expirada', 'O prazo acabou sem acordo.'],
          ['Sem interesse do profissional', 'No pedido direto, o Profissional recusou participar.'],
          ['Encerrada', 'Encerrada sem outra explicação.'],
          ['Cancelada', 'Existe na plataforma, mas hoje nenhuma ação leva a ela.'],
        ],
      },
    ],
  },
  {
    id: 'propostas-e-contrapropostas',
    titulo: 'Propostas e contrapropostas',
    parte: 'Como as coisas funcionam',
    resumo: 'Da proposta do prestador ao acordo e ao pagamento simulado que cria o Atendimento.',
    blocos: [
      {
        tipo: 'ficha',
        titulo: 'Proposta do prestador',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Profissional aprovado ou Colaborador compatível com a categoria' },
          { rotulo: 'Onde', conteudo: 'Painel → Oportunidades → Enviar proposta' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Escreve a mensagem da proposta (obrigatória, até 500 caracteres).', 'Opcional: valor e prazo (em branco = “a combinar”).', 'Escolhe por quanto tempo a proposta vale (padrão 48 h).'] },
          { rotulo: 'Regras', conteudo: ['Uma proposta por prestador por pedido; enviar de novo **revisa** a anterior.', 'A validade nunca passa do prazo do pedido; se passar, é encurtada e a tela avisa.', 'No pedido direto, só o Profissional escolhido pode propor.', 'Ninguém propõe no próprio pedido.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Contraproposta e acordo',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Cliente contrapropõe e aceita; prestador responde' },
          { rotulo: 'Onde', conteudo: 'Cliente: Área do Cliente → Orçamentos. Prestador: Painel → Oportunidades.' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Cliente compara as propostas recebidas.', 'Ou **aceita** uma proposta como está, ou faz uma **contraproposta** (valor obrigatório e maior que zero; mensagem até 500 caracteres).', 'O prestador **aceita** a contraproposta (o acordo fecha pelo valor do Cliente) ou **recusa** (a proposta original continua valendo).'] },
          { rotulo: 'Resultado', conteudo: 'Com o acordo, o pedido é encerrado: some da lista dos outros prestadores, ninguém mais propõe e contrapropostas pendentes são recusadas automaticamente. O concorrente perde acesso ao pedido e aos anexos. Nada é apagado.' },
          { rotulo: 'Regras', conteudo: ['Uma contraproposta pendente por vez em cada proposta.', 'Proposta vencida ou pedido expirado não aceita mais acordo.', 'Acordo **não** cria Atendimento. O Atendimento só nasce depois do pagamento.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Pagamento do acordo',
        situacao: 'simulado',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Só o Cliente dono do pedido' },
          { rotulo: 'Onde', conteudo: 'Área do Cliente → Orçamentos → botão **Pagar**' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Confere o resumo do acordo.', 'Se o acordo ficou “a combinar”, digita o valor (regra provisória).', 'Confirma a “Simulação de pagamento”. Nenhum cartão, PIX ou boleto é pedido.'] },
          { rotulo: 'Resultado', conteudo: 'Pagamento registrado como simulado (referência SIM-AAAA-XXXXXXXX), Atendimento criado com protocolo (ex.: #2026-0012), descrição do pedido vira a primeira mensagem do Protocolo, anexos vão junto e o Cliente entra na carteira do prestador. O prestador é avisado.' },
          { rotulo: 'Regras', conteudo: 'Clicar duas vezes, atualizar a página ou abrir duas abas não gera dois pagamentos nem dois protocolos. A trilha que o Cliente vê: Aberta → Aguardando pagamento → Pagamento aprovado → Atendimento criado.' },
        ],
      },
      {
        tipo: 'aviso',
        nivel: 'critico',
        titulo: 'Este pagamento não é real',
        texto: 'Nenhum dinheiro é cobrado do Cliente nem repassado ao prestador. O botão serve apenas para completar o fluxo e criar o Atendimento durante os testes.',
      },
    ],
  },
  {
    id: 'consultorias',
    titulo: 'Consultorias',
    parte: 'Como as coisas funcionam',
    resumo: 'Agendamento com hora marcada, cancelamento, remarcação, conclusão, videochamada e lembretes.',
    blocos: [
      {
        tipo: 'ficha',
        titulo: 'Agendar uma consultoria',
        situacao: 'simulado',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Cliente (e Gestor). Qualquer visitante vê o calendário.' },
          { rotulo: 'Onde', conteudo: 'Perfil público do Profissional → cartão da consultoria' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Escolhe o mês, o dia e o horário livre.', 'Escreve o que deseja tratar (até 1.000 caracteres).', '“Continuar para pagamento” — entra ou cria conta, se precisar.', 'O horário fica **reservado por até 10 minutos** para essa pessoa.', 'Confirma a simulação de pagamento (há também um botão para simular recusa).', 'Tela “Consultoria agendada!” com o protocolo e o botão “Ver meu atendimento”.'] },
          { rotulo: 'Resultado', conteudo: 'Consulta agendada, Atendimento criado (categoria Consultoria) e o Profissional avisado. O Cliente não recebe notificação — vê a confirmação na tela e na Área do Cliente.' },
          { rotulo: 'Regras', conteudo: ['Dois Clientes nunca ficam com o mesmo horário: o segundo recebe “escolha outro horário”.', 'Reserva vencida precisa ser refeita.', 'O preço cobrado é o que estava na tela no momento da reserva, mesmo que o Profissional mude o preço em seguida.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Cancelar, remarcar e concluir',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Onde', conteudo: 'Cliente: Visão geral ou Atendimento. Profissional: Agenda ou Atendimento.' },
          { rotulo: 'Cancelar', conteudo: ['Cliente: até **2 horas antes**. Profissional: até o horário de início, e precisa escrever o motivo (o Cliente vê).', 'O horário volta a ficar livre na hora. O Atendimento continua existindo como registro.', 'O pagamento simulado continua registrado: não há estorno porque não houve cobrança.'] },
          { rotulo: 'Remarcar', conteudo: 'Mesmos prazos do cancelamento. Muda só a data e hora: mesmo Atendimento, mesmo protocolo, mesmo pagamento. O histórico guarda cada horário anterior.' },
          { rotulo: 'Concluir', conteudo: 'Só o Profissional, só depois do horário de término, uma única vez. O horário passar **não** conclui sozinho. Ao concluir, o Atendimento fica Concluído e o Cliente pode avaliar.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Videochamada',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Só o Cliente e o Profissional daquela consultoria' },
          { rotulo: 'Onde', conteudo: 'Dentro do Atendimento da consultoria, acima das abas' },
          { rotulo: 'Regras', conteudo: ['O botão “Entrar na videochamada” libera **10 minutos antes** do início e fica disponível até **15 minutos depois** do término.', 'A sala é privada: ter o endereço da sala não basta para entrar.', 'Consulta cancelada não abre sala. Entrar na sala não conclui a consulta.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Lembretes da consultoria',
        situacao: 'parcial',
        campos: [
          { rotulo: 'Como deveria ser', conteudo: 'Aviso no sino para os dois lados 24 h, 1 h e 10 min antes. Remarcar gera uma nova série.' },
          { rotulo: 'Como está hoje', conteudo: 'A rotina automática que envia esses lembretes está programada para rodar **uma vez por dia** (por volta da meia-noite, horário de Brasília). Na prática, o lembrete de 24 h pode sair, mas os de 1 h e 10 min não chegam a tempo. Além disso, o Cliente não tem sino na sua área.' },
        ],
      },
      {
        tipo: 'aviso',
        nivel: 'critico',
        titulo: 'Não conte com os lembretes',
        texto: 'Por causa da frequência da rotina automática, oriente Clientes e Profissionais a acompanhar o horário da consultoria pela Área do Cliente ou pela Agenda, e não pelos lembretes.',
      },
    ],
  },
  {
    id: 'atendimentos',
    titulo: 'Atendimentos',
    parte: 'Como as coisas funcionam',
    resumo: 'O coração da operação: situações, abas, checklist, prazos, participantes, conclusão e ajustes.',
    blocos: [
      { tipo: 'paragrafo', texto: 'Todo trabalho contratado — por pedido de orçamento pago, serviço do perfil ou consultoria — vira um Atendimento com protocolo no formato **#AAAA-NNNN**. Nesta área não há nada simulado.' },
      { tipo: 'subtitulo', texto: 'Situações e como mudar' },
      {
        tipo: 'tabela',
        colunas: ['De', 'Botões disponíveis'],
        linhas: [
          ['**Novo**', 'Iniciar · Recusar'],
          ['**Em andamento**', 'Solicitar ao cliente · Aguardar assinatura · Concluir · Cancelar'],
          ['**Aguardando cliente**', 'Retomar atendimento · Cancelar'],
          ['**Aguardando assinatura**', 'Retomar atendimento · Concluir · Cancelar'],
          ['**Concluído**', 'Nenhum (só reabre por pedido de ajuste aceito)'],
          ['**Recusado** / **Cancelado**', 'Nenhum. Não voltam.'],
        ],
      },
      { tipo: 'paragrafo', texto: 'Quem muda a situação é a equipe. O Cliente nunca muda a situação, e não há motivo obrigatório para recusar ou cancelar. No quadro, Recusado e Cancelado não têm coluna: aparecem pelo filtro, na visão Lista. O quadro carrega os 200 Atendimentos mais recentes; os mais antigos são encontrados pela busca.' },
      { tipo: 'aviso', nivel: 'atencao', titulo: '“Aguardando assinatura” não é assinatura digital', texto: 'É só uma situação de acompanhamento: não existe assinatura digital de documentos na plataforma.' },
      {
        tipo: 'ficha',
        titulo: 'Abas do Atendimento',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Protocolo', conteudo: 'Registro formal (até 8.000 caracteres por manifestação). O que o Cliente escreve, toda a equipe lê. A resposta de um participante é lida pelo Cliente e por quem escreveu — um participante não vê a resposta de outro. Publicar no Protocolo não muda a situação.' },
          { rotulo: 'Conversa', conteudo: 'Chat com dois canais: **Cliente** (equipe + Cliente) e **Interno** (só equipe; o Cliente não vê nem sabe que existe). Até 4.000 caracteres. Marca mensagens não lidas por pessoa.' },
          { rotulo: 'Arquivos', conteudo: 'Os dois lados anexam PDF, JPG, PNG ou TXT até 10 MB. O download só funciona para quem tem acesso ao Atendimento. Arquivos marcados como entrega final ganham destaque para o Cliente.' },
          { rotulo: 'Histórico', conteudo: 'Linha do tempo com cada fato (criação, mudança de situação, prazos, arquivos, conclusão, reabertura, remarcações…). Fatos internos da equipe não aparecem para o Cliente.' },
          { rotulo: 'Informações', conteudo: 'Cliente, origem (pedido, serviço ou consultoria), valor, prazo, prioridade, participantes e checklist.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Checklist, prioridade e prazo',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Equipe do Atendimento (dono, responsável e participantes). O Cliente só acompanha.' },
          { rotulo: 'Checklist', conteudo: 'Adicionar, marcar, desmarcar, renomear, remover e reordenar etapas (até 40). Cada etapa é **visível ao Cliente** ou **interna**. Etapas vêm do serviço contratado ou são criadas pela equipe.' },
          { rotulo: 'Prioridade', conteudo: 'Alta, Média ou Baixa. O Cliente vê a atual, mas as trocas ficam só no histórico interno.' },
          { rotulo: 'Prazo', conteudo: 'Data definida pela equipe (ou vinda do serviço). Pode ser removida (“Sem prazo definido”). O Cliente é avisado quando o prazo muda. O cartão mostra alerta quando faltam 3 dias ou menos, e a rotina automática avisa a equipe sobre prazos próximos ou vencidos.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Solicitar ao cliente',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['A equipe descreve o que precisa receber.', 'Opcionalmente, cria uma etapa do checklist com isso.', 'O pedido vai para o Protocolo e o Atendimento passa a “Aguardando cliente”.', 'Quando o Cliente responde, a equipe confere e clica em “Retomar atendimento”.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Participantes e convites externos',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Só o prestador dono e o responsável' },
          { rotulo: 'Membro da equipe', conteudo: 'Atribuição direta, sem convite, para quem já é do escritório. Quem atua sozinho não tem equipe e usa convites.' },
          { rotulo: 'Prestador de fora', ordenada: true, conteudo: ['O dono pesquisa prestadores aprovados e envia um convite com escopo e valor opcional.', 'O convidado vê um resumo limitado (sem nome do Cliente, conversa, protocolo ou arquivos) e negocia numa conversa privada entre os dois.', 'Quem convida faz proposta de valor; o convidado faz contraproposta; quem convida pode adotar a contraproposta com um clique.', 'O convidado aceita (vira participante e o valor fica congelado) ou recusa. Quem convidou pode cancelar enquanto está pendente.'] },
          { rotulo: 'Regras', conteudo: ['O convite vale 7 dias. Aceitar é o único momento em que o convidado ganha acesso.', 'O valor negociado entre prestadores **não é cobrado nem pago** pela plataforma — é só um registro do combinado.', 'Remover um participante tira o acesso na hora; o que ele escreveu fica. O responsável não pode ser removido.', 'A caixa “Convites” no quadro junta convites recebidos e enviados, com contador de pendências.'] },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Concluir o Atendimento',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Só o prestador dono ou o responsável (participante convidado não conclui)' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['Clica em Concluir.', 'Escreve uma observação final (opcional, até 8.000 caracteres).', 'Escolhe arquivos já anexados como entrega final (até 20).', 'Se houver etapas abertas no checklist, a tela pergunta antes de continuar — nada é marcado sozinho.'] },
          { rotulo: 'Resultado', conteudo: 'Situação Concluído, registro formal no Protocolo, aviso ao Cliente e à equipe, e liberação da comissão de parceiro, quando houver.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Pedido de ajuste e reabertura',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Cliente pede; dono ou responsável decide' },
          { rotulo: 'Passo a passo', ordenada: true, conteudo: ['No Atendimento concluído, o Cliente descreve o problema (e pode anexar um arquivo).', 'O pedido vai para o Protocolo como “Em análise”. **O Atendimento continua Concluído.**', 'O prestador **aceita** (o Atendimento volta para Em andamento) ou **recusa** com justificativa de pelo menos 10 caracteres.', 'Ao concluir de novo, o pedido é encerrado. A entrega anterior, a avaliação e o histórico são mantidos.'] },
          { rotulo: 'Regra', conteudo: 'Só um pedido em análise por vez em cada Atendimento.' },
        ],
      },
      {
        tipo: 'aviso',
        nivel: 'atencao',
        titulo: 'O que não existe no Atendimento',
        itens: ['Cancelamento do Atendimento pelo Cliente.', 'Reabertura de Atendimento Recusado ou Cancelado.', 'Troca de responsável pela tela.', 'Criação manual de Atendimento (o botão “Novo atendimento” existe, mas é só visual).'],
      },
    ],
  },
  {
    id: 'agenda',
    titulo: 'Agenda',
    parte: 'Como as coisas funcionam',
    resumo: 'Como o Profissional configura preço, horários, exceções e férias da consultoria.',
    blocos: [
      {
        tipo: 'ficha',
        titulo: 'Configurar a consultoria e a agenda',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Profissional aprovado ou Colaborador' },
          { rotulo: 'Onde', conteudo: 'Painel → Agenda → configuração da consultoria' },
          { rotulo: 'O que define', conteudo: ['Preço, duração (padrão 60 min, até 8 h), intervalo entre consultas (até 4 h).', 'Antecedência mínima para agendar (padrão 2 h) e até quantos dias à frente aceita (padrão 60).', 'Fuso horário (padrão São Paulo). Modalidade: só online.', 'Horários semanais: faixas por dia da semana, sem sobreposição.', 'Exceções: dia indisponível, bloqueio de parte do dia, horário extra num dia fora da rotina.', 'Bloqueios de vários dias (férias, viagem), removíveis de uma vez.'] },
          { rotulo: 'Regra importante', conteudo: 'Mudar a agenda **nunca desmarca** consultas já agendadas. Antes de salvar, a tela avisa quais consultas ficariam fora dos novos horários.' },
        ],
      },
      { tipo: 'paragrafo', texto: 'Na mesma tela o Profissional vê a lista das consultorias agendadas, com as ações de cancelar, remarcar, concluir e abrir o Atendimento. As regras dessas ações estão no capítulo Consultorias.' },
    ],
  },
  {
    id: 'avaliacoes',
    titulo: 'Avaliações',
    parte: 'Como as coisas funcionam',
    resumo: 'Como o Cliente avalia e onde a avaliação aparece.',
    blocos: [
      {
        tipo: 'ficha',
        titulo: 'Avaliação do Atendimento',
        situacao: 'pronto',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Só o Cliente dono, só em Atendimento concluído' },
          { rotulo: 'Onde', conteudo: 'Área do Cliente → Atendimentos → abaixo da entrega' },
          { rotulo: 'Regras', conteudo: 'Nota de 1 a 5 estrelas e comentário opcional até 1.000 caracteres. Uma avaliação por Atendimento, que o Cliente pode alterar depois. Aparece no perfil público (os 4 comentários mais recentes, só com o nome do Cliente) e em Painel → Avaliações. Não há moderação.' },
        ],
      },
      {
        tipo: 'ficha',
        titulo: 'Tela Avaliações do Painel',
        situacao: 'parcial',
        campos: [
          { rotulo: 'Quem usa', conteudo: 'Profissional e Colaborador' },
          { rotulo: 'O que mostra', conteudo: 'Média, distribuição das notas e comentários reais recebidos. A mesma média aparece no rodapé da barra lateral e no Dashboard.' },
          { rotulo: 'Atenção', conteudo: 'Um bloco de “conquistas recentes” ao lado das avaliações é fictício.' },
        ],
      },
    ],
  },
]
