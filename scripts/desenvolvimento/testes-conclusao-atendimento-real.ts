/**
 * Fluxo real de conclusão, contra o banco de desenvolvimento.
 *
 * Roda exatamente as funções que as Server Actions chamam — `concluirAtendimento`
 * e as consultas do quadro e do portal —, de modo que autorização, transação,
 * Protocolo, Histórico, notificações e tempo real acontecem de verdade. O script
 * não insere nada à mão nem "arruma" estado: ele conclui e depois lê.
 *
 * Uso:
 *   node --env-file=.env --import tsx \
 *     scripts/desenvolvimento/testes-conclusao-atendimento-real.ts
 */
import { and, eq } from 'drizzle-orm'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  atendimentoArquivos,
  atendimentoEventos,
  atendimentoManifestacoes,
  atendimentoMensagens,
  atendimentos,
  notificacoes,
  usuarios,
} from '../../src/db/schema'
import { concluirAtendimento } from '../../src/features/atendimentos/lib/concluir-atendimento'
import { alterarStatusDoAtendimento } from '../../src/features/atendimentos/lib/alterar-status'
import { listarAtendimentosDoCliente } from '../../src/features/atendimentos/queries/listar-atendimentos-do-cliente'
import { listarAtendimentosDoPrestador } from '../../src/features/atendimentos/queries/listar-atendimentos-do-prestador'
import { obterArquivoDoAtendimento } from '../../src/features/atendimentos/queries/obter-arquivo-do-atendimento'
import { mapearAtendimentoParaCard } from '../../src/features/admin/lib/atendimentos-reais'
import { contarIndicadores } from '../../src/features/admin/lib/filtro-atendimentos'

const COM_ENTREGA = '#2026-0002'
const SEM_ENTREGA = '#2026-0001'

let falhas = 0
function conferir(rotulo: string, condicao: boolean, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`)
  if (!condicao) falhas += 1
}

async function porProtocolo(protocolo: string) {
  const [linha] = await db
    .select({
      id: atendimentos.id,
      status: atendimentos.status,
      prestadorId: atendimentos.prestadorId,
      clienteUsuarioId: atendimentos.clienteUsuarioId,
      concluidoEm: atendimentos.concluidoEm,
      concluidoPor: atendimentos.concluidoPor,
      observacaoFinal: atendimentos.observacaoFinal,
    })
    .from(atendimentos)
    .where(eq(atendimentos.protocolo, protocolo))
    .limit(1)
  if (!linha) throw new Error(`Atendimento ${protocolo} não encontrado.`)
  return linha
}

// ─── 1. Conclusão com entrega, a partir de um Atendimento com checklist aberto ──
console.log(`\n[1] Conclusão com arquivo de entrega — ${COM_ENTREGA}`)
const comEntrega = await porProtocolo(COM_ENTREGA)
const [arquivoParaEntregar] = await db
  .select({ id: atendimentoArquivos.id, nome: atendimentoArquivos.nome })
  .from(atendimentoArquivos)
  .where(eq(atendimentoArquivos.atendimentoId, comEntrega.id))
  .limit(1)

const semConfirmar = await concluirAtendimento({
  atendimentoId: comEntrega.id,
  usuarioId: comEntrega.prestadorId,
  arquivoIds: [arquivoParaEntregar.id],
})
conferir(
  'checklist pendente barra a conclusão sem confirmação',
  !semConfirmar.sucesso && semConfirmar.motivo === 'checklist-pendente',
  !semConfirmar.sucesso ? `pendentes=${semConfirmar.pendentes}` : '',
)
conferir(
  'a recusa não moveu o Atendimento',
  (await porProtocolo(COM_ENTREGA)).status === 'em_andamento',
)

const OBSERVACAO =
  'Serviço concluído. O comprovante e os documentos finais estão disponíveis em Arquivos.'
const conclusao = await concluirAtendimento({
  atendimentoId: comEntrega.id,
  usuarioId: comEntrega.prestadorId,
  observacaoFinal: OBSERVACAO,
  arquivoIds: [arquivoParaEntregar.id],
  confirmarPendencias: true,
})
conferir('conclusão autorizada aceita', conclusao.sucesso)

const depois = await porProtocolo(COM_ENTREGA)
conferir('status virou Concluído', depois.status === 'concluido')
conferir('concluído em gravado', Boolean(depois.concluidoEm), String(depois.concluidoEm))
conferir('concluído por gravado', depois.concluidoPor === comEntrega.prestadorId)
conferir('observação final persistida', depois.observacaoFinal === OBSERVACAO)

const [entregue] = await db
  .select({ finalidade: atendimentoArquivos.finalidade })
  .from(atendimentoArquivos)
  .where(eq(atendimentoArquivos.id, arquivoParaEntregar.id))
conferir(
  'arquivo marcado como entrega final',
  entregue.finalidade === 'entrega_final',
  arquivoParaEntregar.nome,
)

const manifestacoes = await db
  .select({ conteudo: atendimentoManifestacoes.conteudo, visibilidade: atendimentoManifestacoes.visibilidade })
  .from(atendimentoManifestacoes)
  .where(eq(atendimentoManifestacoes.atendimentoId, comEntrega.id))
const formal = manifestacoes.filter((m) => m.conteudo.startsWith('Atendimento concluído.'))
conferir('Protocolo recebeu uma manifestação formal', formal.length === 1)
conferir('a observação final é o conteúdo formal', formal[0]?.conteudo.includes(OBSERVACAO) === true)
conferir('a manifestação é legível por todos', formal[0]?.visibilidade === 'participantes_e_cliente')

const eventos = await db
  .select({ tipo: atendimentoEventos.tipo, visivelCliente: atendimentoEventos.visivelCliente })
  .from(atendimentoEventos)
  .where(eq(atendimentoEventos.atendimentoId, comEntrega.id))
conferir(
  'Histórico registrou a conclusão, visível ao Cliente',
  eventos.filter((e) => e.tipo === 'atendimento_concluido' && e.visivelCliente).length === 1,
)
conferir(
  'Histórico registrou a entrega',
  eventos.filter((e) => e.tipo === 'entrega_final_registrada').length === 1,
)

const mensagensAntes = await db
  .select({ id: atendimentoMensagens.id })
  .from(atendimentoMensagens)
  .where(
    and(
      eq(atendimentoMensagens.atendimentoId, comEntrega.id),
      eq(atendimentoMensagens.conteudo, OBSERVACAO),
    ),
  )
conferir('nada foi escrito na Conversa', mensagensAntes.length === 0)

const avisos = await db
  .select({ titulo: notificacoes.titulo, destino: notificacoes.destino })
  .from(notificacoes)
  .where(
    and(
      eq(notificacoes.atendimentoId, comEntrega.id),
      eq(notificacoes.destinatarioId, comEntrega.clienteUsuarioId),
      eq(notificacoes.tipo, 'atendimento_concluido'),
    ),
  )
conferir('Cliente recebeu uma notificação', avisos.length === 1, avisos[0]?.titulo)
conferir(
  'o clique do Cliente cai em Arquivos',
  (avisos[0]?.destino as { aba?: string } | null)?.aba === 'arquivos',
)

// ─── 2. Idempotência ──────────────────────────────────────────────────────────
console.log('\n[2] Idempotência')
const repetida = await concluirAtendimento({
  atendimentoId: comEntrega.id,
  usuarioId: comEntrega.prestadorId,
  observacaoFinal: 'Tentativa repetida.',
  arquivoIds: [arquivoParaEntregar.id],
  confirmarPendencias: true,
})
conferir('segunda conclusão recusada', !repetida.sucesso && repetida.motivo === 'ja-concluido')
const aposRepetir = await porProtocolo(COM_ENTREGA)
conferir('observação original preservada', aposRepetir.observacaoFinal === OBSERVACAO)
const eventosDepois = await db
  .select({ tipo: atendimentoEventos.tipo })
  .from(atendimentoEventos)
  .where(eq(atendimentoEventos.atendimentoId, comEntrega.id))
conferir(
  'Histórico não duplicou',
  eventosDepois.filter((e) => e.tipo === 'atendimento_concluido').length === 1,
)
const manifestacoesDepois = await db
  .select({ id: atendimentoManifestacoes.id, conteudo: atendimentoManifestacoes.conteudo })
  .from(atendimentoManifestacoes)
  .where(eq(atendimentoManifestacoes.atendimentoId, comEntrega.id))
conferir(
  'Protocolo não duplicou',
  manifestacoesDepois.filter((m) => m.conteudo.startsWith('Atendimento concluído.')).length === 1,
)

// ─── 3. Autorização ───────────────────────────────────────────────────────────
console.log('\n[3] Autorização')
const semEntrega = await porProtocolo(SEM_ENTREGA)
const peloCliente = await concluirAtendimento({
  atendimentoId: semEntrega.id,
  usuarioId: semEntrega.clienteUsuarioId,
})
conferir('Cliente não conclui', !peloCliente.sucesso && peloCliente.motivo === 'sem-acesso')

const [forasteiro] = await db
  .select({ id: usuarios.id, nome: usuarios.nome })
  .from(usuarios)
  .where(eq(usuarios.email, 'demo.profissional.roberto.lima@vincis.local'))
  .limit(1)
if (forasteiro) {
  const porEstranho = await concluirAtendimento({
    atendimentoId: semEntrega.id,
    usuarioId: forasteiro.id,
  })
  conferir(
    'prestador sem vínculo não conclui',
    !porEstranho.sucesso && porEstranho.motivo === 'sem-acesso',
    forasteiro.nome,
  )
  conferir(
    'arquivo de entrega não vaza para prestador sem vínculo',
    (await obterArquivoDoAtendimento({
      atendimentoId: comEntrega.id,
      arquivoId: arquivoParaEntregar.id,
      usuarioId: forasteiro.id,
    })) === null,
  )
}
conferir(
  'Cliente proprietário baixa a entrega',
  (await obterArquivoDoAtendimento({
    atendimentoId: comEntrega.id,
    arquivoId: arquivoParaEntregar.id,
    usuarioId: comEntrega.clienteUsuarioId,
  })) !== null,
)
const atalho = await alterarStatusDoAtendimento({
  atendimentoId: semEntrega.id,
  usuarioId: semEntrega.prestadorId,
  destino: 'concluido',
})
conferir('não dá para concluir pela troca genérica de status', !atalho.sucesso)

// ─── 4. Conclusão sem arquivo ─────────────────────────────────────────────────
console.log(`\n[4] Conclusão só com observação — ${SEM_ENTREGA}`)
const NOTA = 'Consultoria realizada. Este serviço não gera documentos.'
const semDocumento = await concluirAtendimento({
  atendimentoId: semEntrega.id,
  usuarioId: semEntrega.prestadorId,
  observacaoFinal: NOTA,
})
conferir('conclusão sem arquivo é permitida', semDocumento.sucesso)
conferir(
  'nenhuma entrega fictícia foi criada',
  (
    await db
      .select({ id: atendimentoArquivos.id })
      .from(atendimentoArquivos)
      .where(eq(atendimentoArquivos.atendimentoId, semEntrega.id))
  ).length === 0,
)

// ─── 5. O que o Cliente e o quadro passam a ver ───────────────────────────────
console.log('\n[5] Portal do Cliente, Kanban e contadores')
const doCliente = (await listarAtendimentosDoCliente(comEntrega.clienteUsuarioId)).find(
  (a) => a.protocolo === COM_ENTREGA,
)
conferir('Cliente vê status Concluído', doCliente?.status === 'concluido')
conferir('Cliente vê a data da conclusão', Boolean(doCliente?.conclusao?.em))
conferir('Cliente vê quem concluiu', Boolean(doCliente?.conclusao?.porNome), doCliente?.conclusao?.porNome ?? '')
conferir('Cliente vê a observação final', doCliente?.conclusao?.observacaoFinal === OBSERVACAO)
conferir('Cliente vê o arquivo de entrega marcado', doCliente?.arquivos.some((a) => a.finalidade === 'entrega_final') === true)
conferir(
  'Cliente vê a manifestação formal no Protocolo',
  doCliente?.manifestacoes.some((m) => m.conteudo.startsWith('Atendimento concluído.')) === true,
)
conferir(
  'Cliente vê a conclusão no Histórico',
  doCliente?.eventos.some((e) => e.tipo === 'atendimento_concluido') === true,
)

const doPrestador = await listarAtendimentosDoPrestador(comEntrega.prestadorId)
const cards = doPrestador.map((dto) => mapearAtendimentoParaCard(dto, comEntrega.prestadorId))
const card = cards.find((c) => c.number === COM_ENTREGA)
conferir('card foi para a coluna Concluído', card?.status === 'concluido')
conferir('card carrega a entrega', card?.real?.conclusion?.filesCount === 1)
conferir('card não oferece mais nenhuma transição', card?.real?.actions.length === 0)
conferir(
  'arquivo aparece marcado como entrega no painel',
  card?.real?.files.some((f) => f.isDelivery) === true,
)
const indicadores = contarIndicadores(cards)
console.log(`  contadores: ${JSON.stringify(indicadores)}`)
conferir('contador de concluídos subiu', indicadores.concluidos >= 2)
conferir(
  'total permanece coerente',
  indicadores.total === cards.length,
)

console.log(
  falhas === 0
    ? '\nTodas as verificações passaram.'
    : `\n${falhas} verificação(ões) falharam.`,
)
await conexaoPostgres.end({ timeout: 5 })
process.exit(falhas === 0 ? 0 : 1)
