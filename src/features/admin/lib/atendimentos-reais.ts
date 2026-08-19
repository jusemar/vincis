import { rotuloCategoria } from '@/features/atendimentos/constants/atendimento'
import { calcularProgresso } from '@/features/atendimentos/lib/progresso-checklist'
import type { AtendimentoOperacionalDTO } from '@/features/atendimentos/types/atendimento'
import { rotuloPreco } from '@/features/servicos/lib/formatar-preco'
import type { ModeloPreco } from '@/features/servicos/schemas/servico'
import { IDENTIDADE_STATUS } from '../constants/status-atendimento'
import type {
  Access,
  Assignee,
  Category,
  Deadline,
  Priority,
  Protocol,
  RealChecklistItem,
  RealFile,
  Status,
} from '../types/atendimentos'

const UM_DIA = 24 * 60 * 60 * 1000

/**
 * Status do banco → status do Kanban aprovado.
 *
 * A tela já usa `novo` como primeira coluna, então o Atendimento nasce ali. A
 * contratação continua com o estado comercial dela (`pendente`); são coisas
 * diferentes e cada uma guarda a sua.
 */
const STATUS_NO_QUADRO: Record<string, Status> = {
  novo: 'novo',
  em_andamento: 'andamento',
  aguardando_cliente: 'aguardando-cliente',
  aguardando_assinatura: 'aguardando-assinatura',
  concluido: 'concluido',
  recusado: 'recusado',
  cancelado: 'cancelado',
}

const ROTULO_MODELO_PRECO: Record<string, string> = {
  fixo: 'Preço fixo',
  a_partir_de: 'A partir de',
  por_hora: 'Por hora',
  sob_orcamento: 'Sob orçamento',
}

/**
 * Cores das iniciais.
 *
 * Mesma paleta dos responsáveis mockados, escolhida de forma determinística
 * pelo id: a mesma pessoa recebe sempre a mesma cor, sem que ninguém precise
 * cadastrar cor nenhuma.
 */
const CORES_RESPONSAVEL = [
  'bg-rose-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
]

/**
 * Cor da pessoa, derivada do id.
 *
 * Determinística de ponta a ponta: a mesma pessoa recebe a mesma cor no card,
 * na Lista e no painel, sem que ninguém precise cadastrar cor nenhuma e sem
 * coluna nova no banco. A dispersão é feita com um hash de verdade (djb2) e não
 * com a soma dos caracteres — ids parecidos, como dois UUIDs, somavam valores
 * próximos e caíam na mesma cor com frequência.
 *
 * A paleta é a dos mocks, cinco cores: pessoas diferentes podem coincidir, e o
 * anel branco do `AvatarStack` continua separando os círculos quando isso
 * acontece.
 */
function corDeterministica(id: string) {
  let hash = 5381
  for (const letra of id) {
    hash = ((hash * 33) ^ letra.charCodeAt(0)) >>> 0
  }
  return CORES_RESPONSAVEL[hash % CORES_RESPONSAVEL.length]
}

/**
 * Formas de tratamento e conectivos que não são nome de ninguém.
 *
 * "Dra. Ana Carolina Silva" é a Ana Silva: as iniciais dela são AS, e não DA.
 * Título acadêmico e preposição não entram na conta.
 */
const TRATAMENTOS = new Set(['dr', 'dra', 'sr', 'sra', 'srta', 'prof', 'profa', 'adv'])
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

function semAcento(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Iniciais de uma pessoa: primeira letra do primeiro nome + primeira letra do
 * último sobrenome.
 */
export function iniciais(nome: string) {
  const partes = nome
    .trim()
    .split(/\s+/)
    .map((parte) => parte.replace(/\./g, ''))
    .filter(Boolean)
    .filter((parte) => !TRATAMENTOS.has(semAcento(parte)))
    .filter((parte) => !CONECTIVOS.has(semAcento(parte)))

  if (!partes.length) return nome.trim().slice(0, 2).toUpperCase()
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase()
}

function mesmoDia(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

/** "Hoje, 09:12" / "Ontem, 14:30" / "16/08/2026" — data real, sempre. */
function rotuloData(iso: string, agora = new Date()) {
  const data = new Date(iso)
  const hora = data.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (mesmoDia(data, agora)) return `Hoje, ${hora}`
  if (mesmoDia(data, new Date(agora.getTime() - UM_DIA))) return `Ontem, ${hora}`
  return data.toLocaleDateString('pt-BR')
}

/**
 * Prazo real do Atendimento.
 *
 * Sem prazo gravado não há prazo: o card mostra "Sem prazo definido" em vez de
 * simular um vencimento. Descobrir onde falta dado é justamente o ponto desta
 * etapa.
 */
function calcularPrazo(
  prazoEm: string | null,
  agora = new Date(),
): { deadline: Deadline; deadlineLabel: string } {
  if (!prazoEm) return { deadline: 'normal', deadlineLabel: 'Sem prazo definido' }

  const dias = Math.ceil((new Date(prazoEm).getTime() - agora.getTime()) / UM_DIA)
  if (dias < 0) {
    const atraso = Math.abs(dias)
    return {
      deadline: 'vencido',
      deadlineLabel: `Vencido há ${atraso} dia${atraso > 1 ? 's' : ''}`,
    }
  }
  if (dias === 0) return { deadline: 'proximo', deadlineLabel: 'Vence hoje' }
  if (dias === 1) return { deadline: 'proximo', deadlineLabel: 'Vence amanhã' }
  if (dias <= 3) {
    return { deadline: 'proximo', deadlineLabel: `Vence em ${dias} dias` }
  }
  return { deadline: 'normal', deadlineLabel: `${dias} dias restantes` }
}

/**
 * Data no formato do `<input type="date">`.
 *
 * Montada a partir das partes locais, e não de `toISOString()`: no fuso do
 * Brasil o ISO cai no dia anterior a partir das 21h, e o campo abriria numa data
 * que não é a do prazo.
 */
function formatarDataParaCampo(data: Date) {
  const mes = `${data.getMonth() + 1}`.padStart(2, '0')
  const dia = `${data.getDate()}`.padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

function rotuloTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function rotuloTipo(tipoMime: string) {
  if (tipoMime === 'application/pdf') return 'PDF'
  if (tipoMime === 'text/plain') return 'Texto'
  if (tipoMime.startsWith('image/')) return 'Imagem'
  if (tipoMime.includes('sheet') || tipoMime.includes('excel')) return 'Planilha'
  return 'Arquivo'
}

function mapearArquivos(
  atendimentoId: string,
  arquivos: AtendimentoOperacionalDTO['arquivos'],
  agora: Date,
): RealFile[] {
  return arquivos.map((arquivo) => ({
    id: arquivo.id,
    name: arquivo.nome,
    typeLabel: rotuloTipo(arquivo.tipoMime),
    sizeLabel: rotuloTamanho(arquivo.tamanhoBytes),
    dateLabel: rotuloData(arquivo.criadoEm, agora),
    senderLabel:
      arquivo.origem === 'cliente'
        ? `Cliente · ${arquivo.remetenteNome}`
        : arquivo.remetenteNome,
    // Rota autorizada: o conteúdo não tem URL pública.
    url: `/api/atendimentos/${atendimentoId}/arquivos/${arquivo.id}`,
    isDelivery: arquivo.finalidade === 'entrega_final',
  }))
}

/**
 * Atendimento real → card do Kanban.
 *
 * A tradução é só de vocabulário: o card real usa exatamente a mesma estrutura
 * dos mockados, para que nada na tela precise mudar de forma. Onde o backend
 * ainda não tem o dado (checklist, mensagens, prioridade explícita), o campo
 * fica ausente e o componente simplesmente não desenha aquele pedaço — nenhum
 * número é inventado.
 */
export function mapearAtendimentoParaCard(
  atendimento: AtendimentoOperacionalDTO,
  /** Sessão atual: decide de que lado da conversa cada bolha aparece. */
  usuarioSessaoId?: string,
  agora: Date = new Date(),
): Protocol {
  const status = STATUS_NO_QUADRO[atendimento.status] ?? 'novo'
  const prazo = calcularPrazo(atendimento.prazoEm, agora)
  const contratacao = atendimento.contratacao

  const responsavel: Assignee = {
    id: atendimento.responsavel.id,
    name: atendimento.responsavel.nome,
    initials: iniciais(atendimento.responsavel.nome),
    color: corDeterministica(atendimento.responsavel.id),
  }

  // Os demais participantes entram depois do responsável, na mesma pilha de
  // avatares que a tela já usa para vários profissionais.
  const convidados: Assignee[] = atendimento.participantes
    .filter(
      (participante) =>
        participante.usuarioId !== atendimento.responsavel.id,
    )
    .map((participante) => ({
      id: participante.usuarioId,
      name: participante.nome,
      initials: iniciais(participante.nome),
      color: corDeterministica(participante.usuarioId),
    }))

  return {
    id: atendimento.id,
    number: atendimento.protocolo,
    title: atendimento.titulo,
    client: atendimento.cliente.nome,
    clientCode: atendimento.cliente.codigo,
    // Categoria verdadeira do serviço. `consultoria` vira "Consultoria", e não
    // uma categoria vizinha escolhida por conveniência de paleta.
    category: rotuloCategoria(atendimento.categoria) as Category,
    priority: atendimento.prioridade as Priority,
    deadline: prazo.deadline,
    deadlineLabel: prazo.deadlineLabel,
    status,
    // Conversa real: os dois canais somados, que é o que a equipe enxerga no
    // painel. Sem mensagem, o contador mostra zero de verdade. Manifestação do
    // Protocolo **não** entra aqui — são canais separados, e somar os dois daria
    // um número que não corresponde a nada.
    messages: atendimento.mensagens.length,
    files: atendimento.arquivos.length,
    // Progresso do checklist real. Sem etapas o campo fica ausente e o card
    // simplesmente não desenha a barra, como sempre fez com os mocks sem
    // checklist.
    progress: calcularProgresso(atendimento.checklist) ?? undefined,
    // Não lidas de verdade, do ponto de vista de quem está olhando. Zero vira
    // ausente para o card não desenhar uma pílula vermelha vazia.
    unread: atendimento.naoLidas.total || undefined,
    access: atendimento.acesso as Access,
    assignees: [responsavel, ...convidados],
    createdAt: rotuloData(atendimento.criadoEm, agora),
    updatedAtLabel: rotuloData(atendimento.atualizadoEm, agora),
    origin: 'real',
    real: {
      atendimentoId: atendimento.id,
      info: {
        protocol: atendimento.protocolo,
        service: contratacao?.nomeServico ?? atendimento.titulo,
        client: atendimento.cliente.nome,
        clientCode: atendimento.cliente.codigo,
        priceLabel: contratacao
          ? rotuloPreco(
              contratacao.modeloPreco as ModeloPreco,
              contratacao.valorCentavos,
            )
          : null,
        priceModelLabel: contratacao
          ? (ROTULO_MODELO_PRECO[contratacao.modeloPreco] ??
            contratacao.modeloPreco)
          : null,
        hiredAtLabel: contratacao ? rotuloData(contratacao.criadaEm, agora) : null,
        deadlineLabel: atendimento.prazoEm
          ? new Date(atendimento.prazoEm).toLocaleDateString('pt-BR')
          : null,
        deadlineDate: atendimento.prazoEm
          ? formatarDataParaCampo(new Date(atendimento.prazoEm))
          : null,
        statusLabel: IDENTIDADE_STATUS[status].rotulo,
        responsibleName: atendimento.responsavel.nome,
        responsibleId: atendimento.responsavel.id,
      },
      files: mapearArquivos(atendimento.id, atendimento.arquivos, agora),
      checklist: atendimento.checklist.map<RealChecklistItem>((item) => ({
        id: item.id,
        label: item.titulo,
        done: item.concluido,
        internal: item.visibilidade === 'interno',
        origin: item.origem,
      })),
      events: atendimento.eventos.map((evento) => ({
        id: evento.id,
        text: evento.descricao,
        time: rotuloData(evento.criadoEm, agora),
      })),
      messages: atendimento.mensagens.map((mensagem) => ({
        id: mensagem.id,
        author: mensagem.autorId === usuarioSessaoId ? 'Você' : mensagem.autorNome,
        initials:
          mensagem.autorId === usuarioSessaoId ? 'VC' : iniciais(mensagem.autorNome),
        color:
          mensagem.autorId === usuarioSessaoId
            ? 'bg-primary'
            : corDeterministica(mensagem.autorId),
        text: mensagem.conteudo,
        time: rotuloData(mensagem.criadoEm, agora),
        internal: mensagem.escopo === 'interno',
        me: mensagem.autorId === usuarioSessaoId,
      })),
      // Protocolo: registro formal, em ordem cronológica. Nada aqui vem da
      // Conversa — são canais separados, sem dado compartilhado.
      manifestations: atendimento.manifestacoes.map((manifestacao) => ({
        id: manifestacao.id,
        author: manifestacao.autoria ? 'Você' : manifestacao.autorNome,
        initials: manifestacao.autoria
          ? 'VC'
          : iniciais(manifestacao.autorNome),
        color: manifestacao.autoria
          ? 'bg-primary'
          : corDeterministica(manifestacao.autorId),
        text: manifestacao.conteudo,
        time: rotuloData(manifestacao.criadoEm, agora),
        fromClient: manifestacao.papelAutor === 'cliente',
        me: manifestacao.autoria,
        answersId: manifestacao.respondeManifestacaoId,
        attachment: manifestacao.arquivo
          ? { name: manifestacao.arquivo.nome }
          : null,
      })),
      actions: atendimento.acoes,
      // Conclusão real: data, autor e observação vêm do Atendimento. Sem
      // conclusão o campo fica nulo e a tela não desenha nada — mesma regra do
      // prazo e do progresso.
      conclusion: atendimento.conclusao
        ? {
            atLabel: rotuloData(atendimento.conclusao.em, agora),
            byName: atendimento.conclusao.porNome,
            note: atendimento.conclusao.observacaoFinal,
            filesCount: atendimento.conclusao.arquivosDeEntrega,
          }
        : null,
      unread: {
        cliente: atendimento.naoLidas.cliente,
        interno: atendimento.naoLidas.interno,
        total: atendimento.naoLidas.total,
        canalPrimeira: atendimento.naoLidas.canalPrimeira,
        primeiraNaoLidaId: atendimento.naoLidas.primeiraNaoLidaId,
      },
    },
  }
}

/** Status do quadro → status gravado no banco. */
const STATUS_NO_BANCO: Record<Status, string> = {
  novo: 'novo',
  andamento: 'em_andamento',
  'aguardando-cliente': 'aguardando_cliente',
  'aguardando-assinatura': 'aguardando_assinatura',
  concluido: 'concluido',
  recusado: 'recusado',
  cancelado: 'cancelado',
}

export function statusDoBanco(status: Status) {
  return STATUS_NO_BANCO[status]
}
