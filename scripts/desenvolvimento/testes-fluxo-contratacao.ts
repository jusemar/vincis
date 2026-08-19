/**
 * Cenários A–G do fluxo de serviços, com as contas de desenvolvimento reais.
 *
 * Executa as Server Actions de verdade (sessão real gravada em
 * `sessoes_usuario`), sem tocar em senha ou dado das contas existentes.
 *
 * Uso:
 *   node --env-file=.env --import tsx --import ./scripts/desenvolvimento/_registrar-hooks.mjs \
 *     scripts/desenvolvimento/testes-fluxo-contratacao.ts
 */
import { and, eq, like } from 'drizzle-orm'
import { sessaoAtual } from './_stub-next-headers.mjs'
import { conexaoPostgres, db } from '../../src/db/connection'
import {
  clientes,
  contratacoesServico,
  servicos,
  sessoesUsuario,
  usuarios,
} from '../../src/db/schema'
import { gerarTokenSessao } from '../../src/features/usuarios/lib/gerar-token-sessao'

const { criarServico, atualizarServico } = await import(
  '../../src/features/servicos/actions/catalogo'
)
const { contratarServico } = await import(
  '../../src/features/servicos/actions/contratar'
)
const { listarContratacoesDoPrestador, listarMinhasContratacoes } = await import(
  '../../src/features/servicos/actions/contratacoes'
)
const { listarServicosPublicos } = await import(
  '../../src/features/servicos/queries/vitrine-publica'
)

const EMAIL_PROF = 'demo.profissional.ana.silva@vincis.local'
const EMAIL_PROF_B = 'jusemarrjunior@gmail.com'
const EMAIL_CLIENTE = 'cliente.visual@vincis.local'
const USER_AGENT = 'fluxo-contratacao'
const MARCA = ' [fluxo-teste]'

const resultados: { nome: string; ok: boolean }[] = []
const verificar = (nome: string, ok: boolean, detalhe = '') => {
  resultados.push({ nome, ok })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

async function idPorEmail(email: string) {
  const [u] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, email))
    .limit(1)
  if (!u) throw new Error(`Conta ausente: ${email}`)
  return u.id
}

async function abrirSessao(usuarioId: string) {
  const { token, hash } = gerarTokenSessao()
  await db.insert(sessoesUsuario).values({
    usuarioId,
    tokenHash: hash,
    expiraEm: new Date(Date.now() + 3600_000),
    userAgent: USER_AGENT,
  })
  return token
}

const profId = await idPorEmail(EMAIL_PROF)
const profBId = await idPorEmail(EMAIL_PROF_B)
const clienteId = await idPorEmail(EMAIL_CLIENTE)

async function limpar() {
  const criados = await db
    .select({ id: servicos.id })
    .from(servicos)
    .where(like(servicos.nome, `%${MARCA}`))
  const ids = criados.map(({ id }) => id)
  for (const id of ids) {
    await db.delete(contratacoesServico).where(eq(contratacoesServico.servicoId, id))
  }
  if (ids.length) await db.delete(servicos).where(like(servicos.nome, `%${MARCA}`))
  await db
    .delete(clientes)
    .where(and(eq(clientes.usuarioId, clienteId), eq(clientes.profissionalId, profId)))
  await db.delete(sessoesUsuario).where(eq(sessoesUsuario.userAgent, USER_AGENT))
}

await limpar()

const tokenProf = await abrirSessao(profId)
const tokenProfB = await abrirSessao(profBId)
const tokenCliente = await abrirSessao(clienteId)
const entrar = (token: string) => {
  sessaoAtual.token = token
}

// ---------- CENÁRIO A — cadastro do serviço ----------
entrar(tokenProf)
const criado = await criarServico({
  nome: `Declaração de IRPF Teste${MARCA}`,
  descricaoCurta: 'Para pessoa física com rendimentos simples.',
  descricaoDetalhada: 'Preço inicial para casos simples.',
  categoria: 'contabil',
  itensIncluidos: ['Atendimento online', 'Entrega da declaração'],
  modeloPreco: 'fixo',
  valor: '350,00',
  prazoEstimadoDias: 7,
  ativo: true,
  publico: true,
  ordem: 0,
})
verificar('A: profissional cadastra serviço de R$350', criado.sucesso, criado.mensagem)
const servicoId = (criado as { dados: { id: string } }).dados.id

const vitrineProf = await listarServicosPublicos(profId)
verificar(
  'A: aparece no perfil público do próprio profissional',
  vitrineProf.some((s) => s.id === servicoId),
)
const vitrineOutro = await listarServicosPublicos(profBId)
verificar(
  'A: não aparece no perfil de outro profissional',
  !vitrineOutro.some((s) => s.id === servicoId),
)
verificar(
  'A: preço exibido como R$ 350',
  vitrineProf.find((s) => s.id === servicoId)?.price.includes('350') ?? false,
  vitrineProf.find((s) => s.id === servicoId)?.price,
)

// ---------- CENÁRIO B — contratação ----------
entrar(tokenCliente)
const contratacao = await contratarServico({ servicoId })
verificar('B: cliente contrata', contratacao.sucesso, contratacao.mensagem)

const linhas = await db
  .select()
  .from(contratacoesServico)
  .where(eq(contratacoesServico.servicoId, servicoId))
verificar('B: exatamente uma contratação', linhas.length === 1, String(linhas.length))
verificar('B: cliente correto', linhas[0]?.clienteUsuarioId === clienteId)
verificar('B: prestador correto', linhas[0]?.prestadorId === profId)
verificar('B: snapshot de preço = R$350', linhas[0]?.valorSnapshotCentavos === 35000)
verificar('B: status inicial pendente', linhas[0]?.status === 'pendente')

// ---------- CENÁRIO C — admin do profissional ----------
entrar(tokenProf)
const doProf = await listarContratacoesDoPrestador()
const linhaAdmin = doProf.dados?.find((c) => c.id === linhas[0].id)
verificar('C: contratação aparece no admin do prestador', Boolean(linhaAdmin))
verificar('C: cliente correto na tabela', linhaAdmin?.clienteNome === 'Marina Souza', linhaAdmin?.clienteNome)
verificar('C: valor R$350', linhaAdmin?.valorCentavos === 35000)
verificar('C: status Pendente', linhaAdmin?.status === 'pendente')

// ---------- CENÁRIO D — área do cliente ----------
entrar(tokenCliente)
const doCliente = await listarMinhasContratacoes()
verificar(
  'D: serviço aparece na área do cliente',
  (doCliente.dados ?? []).some((c) => c.id === linhas[0].id),
)
verificar('D: não fica em estado vazio', (doCliente.dados ?? []).length > 0)

// ---------- CENÁRIO E — alteração de preço ----------
entrar(tokenProf)
await atualizarServico(servicoId, {
  nome: `Declaração de IRPF Teste${MARCA}`,
  descricaoCurta: 'Para pessoa física com rendimentos simples.',
  descricaoDetalhada: 'Preço inicial para casos simples.',
  categoria: 'contabil',
  itensIncluidos: ['Atendimento online', 'Entrega da declaração'],
  modeloPreco: 'fixo',
  valor: '400,00',
  prazoEstimadoDias: 7,
  ativo: true,
  publico: true,
  ordem: 0,
})
const vitrineDepois = await listarServicosPublicos(profId)
verificar(
  'E: perfil público passa a mostrar R$400',
  vitrineDepois.find((s) => s.id === servicoId)?.price.includes('400') ?? false,
)
const [contratacaoDepois] = await db
  .select()
  .from(contratacoesServico)
  .where(eq(contratacoesServico.id, linhas[0].id))
verificar(
  'E: contratação antiga continua R$350',
  contratacaoDepois.valorSnapshotCentavos === 35000,
)

// ---------- CENÁRIO F — isolamento ----------
entrar(tokenProfB)
const doOutroProf = await listarContratacoesDoPrestador()
verificar(
  'F: outro profissional não vê a contratação',
  !(doOutroProf.dados ?? []).some((c) => c.id === linhas[0].id),
)
entrar(tokenProf)
const comoPrestadorCliente = await listarMinhasContratacoes()
verificar(
  'F: contratação não vaza pela listagem de cliente de outra conta',
  !(comoPrestadorCliente.dados ?? []).some((c) => c.id === linhas[0].id),
)

// ---------- CENÁRIO G — sob orçamento ----------
entrar(tokenProf)
const orcamento = await criarServico({
  nome: `Regularização Teste${MARCA}`,
  descricaoCurta: 'Análise de pendências fiscais e cadastrais.',
  descricaoDetalhada: 'O valor é definido após análise.',
  categoria: 'contabil',
  itensIncluidos: ['Diagnóstico inicial'],
  modeloPreco: 'sob_orcamento',
  valor: '',
  ativo: true,
  publico: true,
  ordem: 1,
})
const orcamentoId = (orcamento as { dados: { id: string } }).dados.id
const vitrineOrc = await listarServicosPublicos(profId)
verificar(
  'G: exibido como Sob orçamento',
  vitrineOrc.find((s) => s.id === orcamentoId)?.price === 'Sob orçamento',
)

entrar(tokenCliente)
await contratarServico({ servicoId: orcamentoId })
const [solicitacao] = await db
  .select()
  .from(contratacoesServico)
  .where(eq(contratacoesServico.servicoId, orcamentoId))
verificar('G: sem preço fictício', solicitacao.valorSnapshotCentavos === null)
verificar('G: status aguardando_orcamento', solicitacao.status === 'aguardando_orcamento')

entrar(tokenProf)
const comOrcamento = await listarContratacoesDoPrestador()
verificar(
  'G: prestador identifica a solicitação',
  (comOrcamento.dados ?? []).some((c) => c.id === solicitacao.id),
)

// ---------- Vínculo com a carteira ----------
const carteira = await db
  .select()
  .from(clientes)
  .where(and(eq(clientes.profissionalId, profId), eq(clientes.usuarioId, clienteId)))
verificar('Carteira: cliente vinculado uma única vez', carteira.length === 1, String(carteira.length))

console.log('\nLimpando dados do teste...')
await limpar()

const falhas = resultados.filter(({ ok }) => !ok).length
console.log(`\n${resultados.length - falhas}/${resultados.length} verificações aprovadas.`)
await conexaoPostgres.end({ timeout: 5 })
process.exit(falhas ? 1 : 0)
