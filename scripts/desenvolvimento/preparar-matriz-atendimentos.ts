/**
 * Matriz de Atendimentos reais para comparar com os cards mockados.
 *
 * Os mocks mostram situações que os três Atendimentos reais não tinham: coluna
 * cheia, checklist pela metade, prazo vencido, dois responsáveis. Este script
 * cria — em contas de demonstração `@vincis.local` — pelo menos um Atendimento
 * real para cada uma dessas situações, para que dê para pôr mock e real lado a
 * lado e conferir se o dado real usa o mesmo componente.
 *
 * É idempotente: as contratações têm id fixo, o Atendimento de cada uma é único
 * e os ajustes (status, prazo, prioridade, checklist) são reaplicados sem
 * duplicar nada. Rodar de novo atualiza os prazos relativos a hoje, que é o que
 * mantém "Vence amanhã" significando amanhã.
 *
 * Nada aqui apaga ou altera os Atendimentos #2026-0001, #2026-0002 e #2026-0003.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/preparar-matriz-atendimentos.ts
 */
import { and, eq, inArray } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  atendimentoChecklistItens,
  atendimentoMensagens,
  atendimentoParticipantes,
  atendimentos,
  clientes,
  contratacoesServico,
  servicos,
  usuarios,
} from '../../src/db/schema'
import type { StatusAtendimento } from '../../src/features/atendimentos/constants/atendimento'
import {
  definirPrazoDoAtendimento,
  definirPrioridadeDoAtendimento,
} from '../../src/features/atendimentos/lib/ajustes-operacionais'
import { alterarStatusDoAtendimento } from '../../src/features/atendimentos/lib/alterar-status'
import { alternarItemDoChecklist } from '../../src/features/atendimentos/lib/checklist'
import { garantirAtendimentoDaContratacao } from '../../src/features/atendimentos/lib/criar-atendimento-da-contratacao'
import { enviarMensagemNoAtendimento } from '../../src/features/atendimentos/lib/mensagens'
import { solicitarAoCliente } from '../../src/features/atendimentos/lib/solicitar-ao-cliente'

const UM_DIA = 24 * 60 * 60 * 1000

const EMAIL = {
  ana: 'demo.profissional.ana.silva@vincis.local',
  ricardo: 'demo.profissional.ricardo.mendes@vincis.local',
  marina: 'cliente.visual@vincis.local',
  paulo: 'cliente.teste.atendimentos@vincis.local',
}

const CHECKLIST_MEI = [
  'Receber documentos do cliente',
  'Conferir dados cadastrais',
  'Definir CNAE principal',
  'Emitir certificado digital',
  'Realizar abertura no portal',
  'Emitir alvará e inscrições',
  'Entregar documentação final',
]

const CHECKLIST_IRPF = [
  'Reunir informes de rendimento',
  'Conferir despesas dedutíveis',
  'Preencher a declaração',
  'Revisar com o cliente',
  'Transmitir à Receita',
]

/**
 * Cenários da matriz.
 *
 * O id da contratação é fixo de propósito: é a chave de idempotência. Cada
 * cenário diz para onde o Atendimento deve ir — o caminho de status é percorrido
 * pela mesma máquina de estados da aplicação, então o histórico sai verdadeiro.
 */
type Cenario = {
  contratacaoId: string
  cliente: 'marina' | 'paulo'
  servico: 'mei' | 'irpf'
  status: StatusAtendimento
  prioridade?: 'alta' | 'media' | 'baixa'
  /** Dias a partir de hoje. Negativo = vencido. `null` = sem prazo. */
  prazoEmDias: number | null
  /** Quantas etapas do checklist já foram concluídas. */
  etapasConcluidas: number
  comRicardo?: boolean
  mensagens?: { autor: 'ana' | 'cliente'; texto: string }[]
  solicitacao?: string
  descricao: string
}

const CENARIOS: Cenario[] = [
  {
    contratacaoId: '11111111-1111-4111-8111-000000000001',
    cliente: 'marina',
    servico: 'mei',
    status: 'em_andamento',
    prioridade: 'media',
    prazoEmDias: 1,
    etapasConcluidas: 4,
    comRicardo: true,
    mensagens: [
      { autor: 'cliente', texto: 'Boa tarde! Já consigo emitir notas?' },
      {
        autor: 'ana',
        texto: 'Ainda não: falta o alvará. Assim que sair eu te aviso por aqui.',
      },
    ],
    descricao: 'Em andamento · checklist 4/7 · vence amanhã · Ana + Ricardo',
  },
  {
    contratacaoId: '11111111-1111-4111-8111-000000000002',
    cliente: 'paulo',
    servico: 'irpf',
    status: 'aguardando_cliente',
    prioridade: 'alta',
    prazoEmDias: -1,
    etapasConcluidas: 1,
    solicitacao:
      'Envie os informes de rendimento de todos os bancos e os recibos de despesas médicas do ano.',
    descricao: 'Aguardando cliente · alta · vencido há 1 dia · solicitação real',
  },
  {
    contratacaoId: '11111111-1111-4111-8111-000000000003',
    cliente: 'marina',
    servico: 'mei',
    status: 'aguardando_assinatura',
    prioridade: 'baixa',
    prazoEmDias: 5,
    etapasConcluidas: 5,
    descricao: 'Aguardando assinatura · checklist 5/7 · 5 dias restantes',
  },
  {
    contratacaoId: '11111111-1111-4111-8111-000000000004',
    cliente: 'paulo',
    servico: 'irpf',
    status: 'concluido',
    prioridade: 'media',
    prazoEmDias: 10,
    etapasConcluidas: 5,
    descricao: 'Concluído · checklist 5/5',
  },
  {
    contratacaoId: '11111111-1111-4111-8111-000000000005',
    cliente: 'marina',
    servico: 'irpf',
    status: 'novo',
    prazoEmDias: 12,
    etapasConcluidas: 0,
    descricao: 'Novo · sem etapa concluída',
  },
  {
    contratacaoId: '11111111-1111-4111-8111-000000000006',
    cliente: 'paulo',
    servico: 'mei',
    status: 'novo',
    prazoEmDias: 3,
    etapasConcluidas: 1,
    descricao: 'Novo · vence em 3 dias',
  },
  {
    contratacaoId: '11111111-1111-4111-8111-000000000007',
    cliente: 'marina',
    servico: 'mei',
    status: 'novo',
    prioridade: 'alta',
    prazoEmDias: null,
    etapasConcluidas: 0,
    descricao: 'Novo · alta · sem prazo definido',
  },
]

/** Caminho que a máquina de estados aceita até cada destino. */
const CAMINHO: Record<StatusAtendimento, StatusAtendimento[]> = {
  novo: [],
  em_andamento: ['em_andamento'],
  aguardando_cliente: ['em_andamento', 'aguardando_cliente'],
  aguardando_assinatura: ['em_andamento', 'aguardando_assinatura'],
  concluido: ['em_andamento', 'concluido'],
  recusado: ['recusado'],
  cancelado: ['cancelado'],
}

async function usuarioPorEmail(email: string) {
  const [linha] = await db
    .select({ id: usuarios.id, nome: usuarios.nome })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1)
  if (!linha) throw new Error(`Conta de demonstração ausente: ${email}`)
  return linha
}

async function servicoPorNome(prestadorId: string, nome: string) {
  const [linha] = await db
    .select({
      id: servicos.id,
      nome: servicos.nome,
      modeloPreco: servicos.modeloPreco,
      valorCentavos: servicos.valorCentavos,
      prazoEstimadoDias: servicos.prazoEstimadoDias,
    })
    .from(servicos)
    .where(and(eq(servicos.prestadorId, prestadorId), eq(servicos.nome, nome)))
    .limit(1)
  if (!linha) throw new Error(`Serviço de demonstração ausente: ${nome}`)
  return linha
}

async function carteiraDoCliente(prestadorId: string, clienteUsuarioId: string) {
  const [linha] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(
        eq(clientes.profissionalId, prestadorId),
        eq(clientes.usuarioId, clienteUsuarioId),
      ),
    )
    .limit(1)
  return linha?.id ?? null
}

const ana = await usuarioPorEmail(EMAIL.ana)
const ricardo = await usuarioPorEmail(EMAIL.ricardo)
const marina = await usuarioPorEmail(EMAIL.marina)
const paulo = await usuarioPorEmail(EMAIL.paulo)

const mei = await servicoPorNome(ana.id, 'Abertura de Empresa MEI')
const irpf = await servicoPorNome(ana.id, 'Declaração de IRPF Teste')

// O modelo de checklist vive no catálogo. Cada contratação leva uma cópia dele
// para o Atendimento — e é essa cópia que a equipe passa a editar.
await db
  .update(servicos)
  .set({ checklistModelo: CHECKLIST_MEI })
  .where(eq(servicos.id, mei.id))
await db
  .update(servicos)
  .set({ checklistModelo: CHECKLIST_IRPF })
  .where(eq(servicos.id, irpf.id))
console.log('Checklist modelo definido nos dois serviços da Ana.')

const CLIENTES = { marina, paulo }
const SERVICOS = { mei, irpf }

const resumo: string[] = []

for (const cenario of CENARIOS) {
  const cliente = CLIENTES[cenario.cliente]
  const servico = SERVICOS[cenario.servico]
  const carteiraId = await carteiraDoCliente(ana.id, cliente.id)

  await db
    .insert(contratacoesServico)
    .values({
      id: cenario.contratacaoId,
      servicoId: servico.id,
      prestadorId: ana.id,
      clienteUsuarioId: cliente.id,
      clienteCarteiraId: carteiraId,
      nomeServicoSnapshot: servico.nome,
      modeloPrecoSnapshot: servico.modeloPreco,
      valorSnapshotCentavos: servico.valorCentavos,
      prazoEstimadoDias: servico.prazoEstimadoDias,
      status: 'aceita',
      observacoes: 'Cenário de comparação mock × real.',
    })
    .onConflictDoNothing()

  const atendimento = await garantirAtendimentoDaContratacao(
    db,
    cenario.contratacaoId,
  )

  // Segundo responsável: entra na mesma lista que autoriza qualquer convidado.
  if (cenario.comRicardo) {
    const [jaEsta] = await db
      .select({ id: atendimentoParticipantes.id })
      .from(atendimentoParticipantes)
      .where(
        and(
          eq(atendimentoParticipantes.atendimentoId, atendimento.id),
          eq(atendimentoParticipantes.usuarioId, ricardo.id),
        ),
      )
      .limit(1)
    if (!jaEsta) {
      await db.insert(atendimentoParticipantes).values({
        atendimentoId: atendimento.id,
        usuarioId: ricardo.id,
        papel: 'convidado',
      })
    }
  }

  // Etapas concluídas: as primeiras da lista, pela ordem do roteiro.
  const etapas = await db
    .select({
      id: atendimentoChecklistItens.id,
      concluido: atendimentoChecklistItens.concluido,
    })
    .from(atendimentoChecklistItens)
    .where(eq(atendimentoChecklistItens.atendimentoId, atendimento.id))
    .orderBy(atendimentoChecklistItens.ordem)

  for (const [indice, etapa] of etapas.entries()) {
    const deveEstarConcluida = indice < cenario.etapasConcluidas
    if (etapa.concluido === deveEstarConcluida) continue
    await alternarItemDoChecklist({
      itemId: etapa.id,
      usuarioId: ana.id,
      concluido: deveEstarConcluida,
    })
  }

  if (cenario.prioridade) {
    await definirPrioridadeDoAtendimento({
      atendimentoId: atendimento.id,
      usuarioId: ana.id,
      prioridade: cenario.prioridade,
    })
  }

  // Prazo relativo a hoje: é o que faz "Vence amanhã" continuar sendo amanhã
  // quando o script roda de novo em outro dia.
  await definirPrazoDoAtendimento({
    atendimentoId: atendimento.id,
    usuarioId: ana.id,
    prazoEm:
      cenario.prazoEmDias === null
        ? null
        : new Date(Date.now() + cenario.prazoEmDias * UM_DIA),
  })

  for (const mensagem of cenario.mensagens ?? []) {
    const [existente] = await db
      .select({ id: atendimentoMensagens.id })
      .from(atendimentoMensagens)
      .where(
        and(
          eq(atendimentoMensagens.atendimentoId, atendimento.id),
          eq(atendimentoMensagens.conteudo, mensagem.texto),
        ),
      )
      .limit(1)
    if (existente) continue
    await enviarMensagemNoAtendimento({
      atendimentoId: atendimento.id,
      usuarioId: mensagem.autor === 'ana' ? ana.id : cliente.id,
      escopo: 'cliente',
      conteudo: mensagem.texto,
    })
  }

  const [atual] = await db
    .select({ status: atendimentos.status, protocolo: atendimentos.protocolo })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimento.id))

  // A solicitação formal já move o Atendimento para "Aguardando cliente":
  // registra o pedido no Protocolo, cria a etapa e muda o status de uma vez.
  if (cenario.solicitacao && atual.status !== 'aguardando_cliente') {
    if (atual.status === 'novo') {
      await alterarStatusDoAtendimento({
        atendimentoId: atendimento.id,
        usuarioId: ana.id,
        destino: 'em_andamento',
      })
    }
    await solicitarAoCliente({
      atendimentoId: atendimento.id,
      usuarioId: ana.id,
      conteudo: cenario.solicitacao,
      etapaChecklist: 'Receber documentos solicitados ao cliente',
    })
  } else if (!cenario.solicitacao && atual.status !== cenario.status) {
    for (const passo of CAMINHO[cenario.status]) {
      await alterarStatusDoAtendimento({
        atendimentoId: atendimento.id,
        usuarioId: ana.id,
        destino: passo,
      })
    }
  }

  const [final] = await db
    .select({ protocolo: atendimentos.protocolo, status: atendimentos.status })
    .from(atendimentos)
    .where(eq(atendimentos.id, atendimento.id))

  resumo.push(`${final.protocolo}  ${final.status.padEnd(22)} ${cenario.descricao}`)
}

console.log('\nMatriz preparada:')
for (const linha of resumo) console.log(`  ${linha}`)

const preservados = await db
  .select({ protocolo: atendimentos.protocolo, status: atendimentos.status })
  .from(atendimentos)
  .where(inArray(atendimentos.protocolo, ['#2026-0001', '#2026-0002', '#2026-0003']))
console.log('\nAtendimentos preservados:')
for (const linha of preservados) {
  console.log(`  ${linha.protocolo}  ${linha.status}`)
}

await conexaoPostgres.end()
