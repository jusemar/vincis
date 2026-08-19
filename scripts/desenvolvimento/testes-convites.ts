/**
 * Testes de desenvolvimento dos dois fluxos de convite.
 *
 * Executa as server actions reais (mesmo código usado pela interface) com a
 * sessão simulada pelos stubs de `next/headers`, provando que:
 *  - convite de equipe cria vínculo permanente em `empresa_membros`;
 *  - convite de colaboração concede acesso pontual e revogável a um cliente,
 *    sem criar nenhum vínculo de escritório.
 *
 * Uso:
 *   node --env-file=.env --import tsx --import ./scripts/desenvolvimento/_registrar-hooks.mjs \
 *     scripts/desenvolvimento/testes-convites.ts
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { sessaoAtual } from './_stub-next-headers.mjs'
import { db } from '../../src/db/connection'
import {
  clienteAtribuicoes,
  clientes,
  colaboracoesCliente,
  convitesEmpresa,
  empresaMembros,
  empresas,
  sessoesUsuario,
  usuarios,
} from '../../src/db/schema'
import { gerarTokenSessao } from '../../src/features/usuarios/lib/gerar-token-sessao'

const {
  carregarEquipe,
  enviarConviteEmpresa,
  responderConviteEmpresa,
  alterarAtribuicaoCliente,
} = await import('../../src/features/empresas/actions/equipe')
const {
  carregarColaboracoes,
  enviarConviteColaboracao,
  responderConviteColaboracao,
  revogarColaboracao,
} = await import('../../src/features/clientes/actions/colaboracoes')
const { criarCliente, listarMeusClientes, obterMeuCliente } = await import(
  '../../src/features/clientes/actions/clientes'
)
const { resolverAcessoCliente } = await import(
  '../../src/features/clientes/lib/acesso-cliente'
)
const { resolverAcessoUsuario } = await import(
  '../../src/features/usuarios/queries/obter-destino-apos-login'
)

const EMAILS = {
  proprietario: 'jusemarrjunior@gmail.com',
  profissionalEquipe: 'demo.profissional.ana.silva@vincis.local',
  // Papel "colaborador" exige pessoa do tipo Colaborador: a conta usada aqui
  // vem de gerenciar-colaboradores-teste.ts.
  colaboradorEquipe: 'demo.colaborador.paula.ramos@vincis.local',
  externo1: 'demo.profissional.ricardo.mendes@vincis.local',
  externo2: 'demo.profissional.fernanda.oliveira@vincis.local',
  externo3: 'demo.profissional.juliana.costa@vincis.local',
  individual: 'profissiona@teste.com',
} as const

type Papel = keyof typeof EMAILS

const resultados: { nome: string; ok: boolean; detalhe: string }[] = []

function verificar(nome: string, ok: boolean, detalhe = '') {
  resultados.push({ nome, ok, detalhe })
  console.log(`${ok ? 'PASS' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
}

const ids = {} as Record<Papel, string>
const tokens = {} as Record<Papel, string>

async function prepararSessoes() {
  for (const [papel, email] of Object.entries(EMAILS) as [Papel, string][]) {
    const [usuario] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1)
    if (!usuario) throw new Error(`Conta de teste ausente: ${email}`)
    ids[papel] = usuario.id

    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 60 * 60 * 1000),
      userAgent: 'testes-convites',
    })
    tokens[papel] = token
  }
}

function entrarComo(papel: Papel) {
  sessaoAtual.token = tokens[papel]
}

async function limparSessoes() {
  await db
    .delete(sessoesUsuario)
    .where(eq(sessoesUsuario.userAgent, 'testes-convites'))
}

async function empresaDoProprietario() {
  const [vinculo] = await db
    .select({ empresaId: empresas.id, nome: empresas.nome })
    .from(empresaMembros)
    .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
    .where(
      and(
        eq(empresaMembros.usuarioId, ids.proprietario),
        eq(empresaMembros.funcao, 'proprietario'),
        eq(empresaMembros.status, 'ativo'),
      ),
    )
    .limit(1)
  if (!vinculo) throw new Error('Proprietário sem escritório ativo.')
  return vinculo
}

async function garantirCliente(nome: string) {
  const [existente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(eq(clientes.profissionalId, ids.proprietario), eq(clientes.nome, nome)),
    )
    .limit(1)
  if (existente) return existente.id

  entrarComo('proprietario')
  const criacao = await criarCliente({
    nome,
    email: `${nome.toLowerCase().replaceAll(/[^a-z0-9]/g, '')}@teste.local`,
    telefone: '31999990000',
    empresaNome: '',
    area: 'contabil',
    status: 'ativo',
    tipoAtendimento: 'mensal',
    valorReferencia: '500,00',
    observacoes: '',
    cep: '30140071',
    logradouro: 'Avenida Afonso Pena',
    numero: '1000',
    complemento: '',
    bairro: 'Centro',
    cidade: 'Belo Horizonte',
    estado: 'MG',
  })
  if (!criacao.sucesso) throw new Error(`Não criou ${nome}: ${criacao.mensagem}`)

  const [criado] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(eq(clientes.profissionalId, ids.proprietario), eq(clientes.nome, nome)),
    )
    .limit(1)
  return criado.id
}

/**
 * Devolve o cenário ao estado inicial para que a execução prove o fluxo inteiro
 * (convite → aceite → acesso → revogação) e não apenas o bloqueio de duplicidade.
 * Remove somente o que este script cria.
 */
async function reiniciarCenario(empresaId: string) {
  const convidados = [
    ids.profissionalEquipe,
    ids.colaboradorEquipe,
    ids.externo1,
    ids.externo2,
    ids.externo3,
  ]

  await db
    .delete(colaboracoesCliente)
    .where(inArray(colaboracoesCliente.destinatarioId, convidados))
  await db
    .delete(clienteAtribuicoes)
    .where(inArray(clienteAtribuicoes.profissionalId, convidados))
  await db
    .delete(convitesEmpresa)
    .where(
      and(
        eq(convitesEmpresa.empresaId, empresaId),
        inArray(convitesEmpresa.destinatarioId, convidados),
      ),
    )
  await db
    .delete(empresaMembros)
    .where(
      and(
        eq(empresaMembros.empresaId, empresaId),
        inArray(empresaMembros.usuarioId, convidados),
      ),
    )
}

async function contarMembros(empresaId: string, usuarioId: string) {
  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.empresaId, empresaId),
        eq(empresaMembros.usuarioId, usuarioId),
      ),
    )
  return linha?.total ?? 0
}

async function convidarParaEquipe(
  empresaId: string,
  destinatario: Papel,
  funcao: 'administrador' | 'profissional' | 'colaborador',
) {
  entrarComo('proprietario')
  const envio = await enviarConviteEmpresa({
    empresaId,
    destinatarioId: ids[destinatario],
    funcao,
  })
  if (!envio.sucesso && !envio.mensagem.includes('já')) {
    throw new Error(`Convite de equipe falhou: ${envio.mensagem}`)
  }
  const [convite] = await db
    .select({ id: convitesEmpresa.id, status: convitesEmpresa.status })
    .from(convitesEmpresa)
    .where(
      and(
        eq(convitesEmpresa.empresaId, empresaId),
        eq(convitesEmpresa.destinatarioId, ids[destinatario]),
        eq(convitesEmpresa.status, 'pendente'),
      ),
    )
    .limit(1)
  return { envio, conviteId: convite?.id ?? null }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script não pode ser executado em produção.')
  }

  await prepararSessoes()
  const escritorio = await empresaDoProprietario()
  await reiniciarCenario(escritorio.empresaId)

  // 2 — conta proprietária
  const acesso = await resolverAcessoUsuario(ids.proprietario)
  verificar(
    '2. Conta proprietária entra em /admin',
    acesso?.destino === '/admin',
    `destino=${acesso?.destino} status=${acesso?.statusProfissional}`,
  )

  // 3 — proprietário envia convite de equipe
  const primeiro = await convidarParaEquipe(
    escritorio.empresaId,
    'profissionalEquipe',
    'profissional',
  )
  verificar(
    '3. Proprietário envia convite de equipe',
    primeiro.envio.sucesso || Boolean(primeiro.conviteId),
    primeiro.envio.mensagem,
  )

  // 4 — duplicidade de convite de equipe
  entrarComo('proprietario')
  const duplicado = await enviarConviteEmpresa({
    empresaId: escritorio.empresaId,
    destinatarioId: ids.profissionalEquipe,
    funcao: 'profissional',
  })
  verificar(
    '4. Convite de equipe duplicado é bloqueado',
    !duplicado.sucesso,
    duplicado.mensagem,
  )

  // 5 — aceite
  entrarComo('profissionalEquipe')
  const aceite = primeiro.conviteId
    ? await responderConviteEmpresa({
        conviteId: primeiro.conviteId,
        resposta: 'aceitar',
      })
    : { sucesso: true, mensagem: 'Convite já aceito anteriormente.' }
  verificar('5. Convidado aceita convite de equipe', aceite.sucesso, aceite.mensagem)

  // 6 — membro aparece na equipe
  entrarComo('proprietario')
  const equipe = await carregarEquipe()
  const membroNaEquipe =
    equipe.sucesso &&
    equipe.dados.membros.some(
      (membro) =>
        membro.usuarioId === ids.profissionalEquipe &&
        membro.empresaId === escritorio.empresaId,
    )
  verificar(
    '6. Membro aparece em Equipe → Profissionais',
    Boolean(membroNaEquipe),
    `vínculos=${await contarMembros(escritorio.empresaId, ids.profissionalEquipe)}`,
  )

  // colaborador de equipe (para os cenários 8 e 15)
  const conviteColaborador = await convidarParaEquipe(
    escritorio.empresaId,
    'colaboradorEquipe',
    'colaborador',
  )
  if (conviteColaborador.conviteId) {
    entrarComo('colaboradorEquipe')
    await responderConviteEmpresa({
      conviteId: conviteColaborador.conviteId,
      resposta: 'aceitar',
    })
  }

  // clientes e atribuições
  const clienteA = await garantirCliente('Cliente A colaboracao')
  const clienteB = await garantirCliente('Cliente B reservado')

  entrarComo('proprietario')
  for (const papel of ['profissionalEquipe', 'colaboradorEquipe'] as Papel[]) {
    await alterarAtribuicaoCliente({
      empresaId: escritorio.empresaId,
      clienteId: clienteA,
      profissionalId: ids[papel],
      atribuir: true,
    })
  }

  // 7 — profissional de escritório envia colaboração
  entrarComo('profissionalEquipe')
  const colaboracao1 = await enviarConviteColaboracao({
    clienteId: clienteA,
    destinatarioId: ids.externo1,
  })
  verificar(
    '7. Profissional de escritório envia convite de colaboração',
    colaboracao1.sucesso,
    colaboracao1.mensagem,
  )

  // duplicidade de colaboração
  const colaboracaoDuplicada = await enviarConviteColaboracao({
    clienteId: clienteA,
    destinatarioId: ids.externo1,
  })
  verificar(
    '4b. Colaboração duplicada é bloqueada',
    !colaboracaoDuplicada.sucesso,
    colaboracaoDuplicada.mensagem,
  )

  // convidado só responde o convite dele
  const [conviteExterno1] = await db
    .select({ id: colaboracoesCliente.id })
    .from(colaboracoesCliente)
    .where(
      and(
        eq(colaboracoesCliente.clienteId, clienteA),
        eq(colaboracoesCliente.destinatarioId, ids.externo1),
        eq(colaboracoesCliente.status, 'pendente'),
      ),
    )
    .limit(1)

  entrarComo('externo2')
  const respostaIndevida = await responderConviteColaboracao({
    colaboracaoId: conviteExterno1.id,
    resposta: 'aceitar',
  })
  verificar(
    '5b. Convite de colaboração só pode ser aceito pelo destinatário',
    !respostaIndevida.sucesso,
    respostaIndevida.mensagem,
  )

  entrarComo('externo1')
  const aceiteColaboracao = await responderConviteColaboracao({
    colaboracaoId: conviteExterno1.id,
    resposta: 'aceitar',
  })
  verificar(
    '7b. Convidado aceita a colaboração',
    aceiteColaboracao.sucesso,
    aceiteColaboracao.mensagem,
  )

  // 16 — nenhuma membership criada
  verificar(
    '16. Colaboração não cria membership de escritório',
    (await contarMembros(escritorio.empresaId, ids.externo1)) === 0,
    'empresa_membros permanece sem o convidado externo',
  )

  // 10 — acesso somente ao cliente autorizado
  entrarComo('externo1')
  const listaExterno = await listarMeusClientes({})
  const idsVisiveis =
    listaExterno.dados?.clientes.map((cliente) => cliente.id) ?? []
  verificar(
    '10. Convidado enxerga apenas o cliente autorizado',
    idsVisiveis.includes(clienteA) && !idsVisiveis.includes(clienteB),
    `clientes visíveis=${idsVisiveis.length}`,
  )

  // 11 — outro cliente é negado
  const clienteNegado = await obterMeuCliente(clienteB)
  verificar(
    '11. Convidado não acessa outro cliente',
    !clienteNegado.sucesso,
    clienteNegado.mensagem,
  )

  // colaborador externo não repassa acesso
  const repasse = await enviarConviteColaboracao({
    clienteId: clienteA,
    destinatarioId: ids.externo3,
  })
  verificar(
    '7c. Colaborador externo não repassa o acesso',
    !repasse.sucesso,
    repasse.mensagem,
  )

  // 8 — colaborador do escritório envia colaboração
  entrarComo('colaboradorEquipe')
  const colaboracao2 = await enviarConviteColaboracao({
    clienteId: clienteA,
    destinatarioId: ids.externo2,
  })
  verificar(
    '8. Colaborador do escritório envia convite de colaboração',
    colaboracao2.sucesso,
    colaboracao2.mensagem,
  )

  // convite pendente ainda não concede acesso
  entrarComo('externo2')
  const antesDoAceite = await listarMeusClientes({})
  verificar(
    '8a. Convite pendente não concede acesso',
    (antesDoAceite.dados?.clientes ?? []).length === 0,
    `clientes visíveis=${(antesDoAceite.dados?.clientes ?? []).length}`,
  )

  // 9 — profissional individual envia colaboração
  entrarComo('individual')
  const [clienteIndividual] = await db
    .select({ id: clientes.id, empresaId: clientes.empresaId })
    .from(clientes)
    .where(eq(clientes.profissionalId, ids.individual))
    .limit(1)
  const empresasAntes = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(empresas)
  const colaboracao3 = await enviarConviteColaboracao({
    clienteId: clienteIndividual.id,
    destinatarioId: ids.externo3,
  })
  const empresasDepois = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(empresas)
  verificar(
    '9. Profissional individual envia convite de colaboração',
    colaboracao3.sucesso,
    colaboracao3.mensagem,
  )
  verificar(
    '9b. Colaboração individual não cria empresa nem membership',
    empresasAntes[0].total === empresasDepois[0].total &&
      (await contarMembros(escritorio.empresaId, ids.externo3)) === 0,
    `empresas=${empresasDepois[0].total}`,
  )

  // 8b — o profissional convidado pelo colaborador acessa somente o escopo
  const [conviteExterno2] = await db
    .select({ id: colaboracoesCliente.id })
    .from(colaboracoesCliente)
    .where(
      and(
        eq(colaboracoesCliente.clienteId, clienteA),
        eq(colaboracoesCliente.destinatarioId, ids.externo2),
        eq(colaboracoesCliente.status, 'pendente'),
      ),
    )
    .limit(1)
  entrarComo('externo2')
  await responderConviteColaboracao({
    colaboracaoId: conviteExterno2.id,
    resposta: 'aceitar',
  })
  const listaExterno2 = await listarMeusClientes({})
  const idsExterno2 = listaExterno2.dados?.clientes.map((item) => item.id) ?? []
  verificar(
    '8b. Apoio do colaborador acessa só o escopo compartilhado',
    idsExterno2.length === 1 &&
      idsExterno2.includes(clienteA) &&
      (await contarMembros(escritorio.empresaId, ids.externo2)) === 0,
    `clientes visíveis=${idsExterno2.length}`,
  )

  // 9c — convidado do profissional individual acessa só o cliente dele
  const [conviteExterno3] = await db
    .select({ id: colaboracoesCliente.id })
    .from(colaboracoesCliente)
    .where(
      and(
        eq(colaboracoesCliente.clienteId, clienteIndividual.id),
        eq(colaboracoesCliente.destinatarioId, ids.externo3),
        eq(colaboracoesCliente.status, 'pendente'),
      ),
    )
    .limit(1)
  entrarComo('externo3')
  await responderConviteColaboracao({
    colaboracaoId: conviteExterno3.id,
    resposta: 'aceitar',
  })
  const listaExterno3 = await listarMeusClientes({})
  const idsExterno3 = listaExterno3.dados?.clientes.map((item) => item.id) ?? []
  verificar(
    '9c. Convidado do profissional individual vê só o cliente autorizado',
    idsExterno3.includes(clienteIndividual.id) &&
      !idsExterno3.includes(clienteA) &&
      !idsExterno3.includes(clienteB),
    `clientes visíveis=${idsExterno3.length}`,
  )

  // 14 — profissional comum tenta convite de equipe
  entrarComo('profissionalEquipe')
  const equipeIndevida = await enviarConviteEmpresa({
    empresaId: escritorio.empresaId,
    destinatarioId: ids.externo1,
    funcao: 'profissional',
  })
  verificar(
    '14. Profissional comum não envia convite de equipe',
    !equipeIndevida.sucesso,
    equipeIndevida.mensagem,
  )

  // 15 — colaborador tenta convite de equipe
  entrarComo('colaboradorEquipe')
  const equipeIndevidaColaborador = await enviarConviteEmpresa({
    empresaId: escritorio.empresaId,
    destinatarioId: ids.externo1,
    funcao: 'colaborador',
  })
  verificar(
    '15. Colaborador não envia convite de equipe',
    !equipeIndevidaColaborador.sucesso,
    equipeIndevidaColaborador.mensagem,
  )

  // 12 — revogação pelo proprietário do cliente
  entrarComo('proprietario')
  const painel = await carregarColaboracoes()
  const concedidaExterno1 = painel.dados?.concedidas.find(
    (item) => item.id === conviteExterno1.id,
  )
  const revogacao = await revogarColaboracao({ colaboracaoId: conviteExterno1.id })
  verificar(
    '12. Proprietário revoga a colaboração',
    revogacao.sucesso && Boolean(concedidaExterno1),
    revogacao.mensagem,
  )

  // 13 — acesso bloqueado após revogação
  entrarComo('externo1')
  const acessoAposRevogacao = await resolverAcessoCliente(ids.externo1, clienteA)
  const clienteAposRevogacao = await obterMeuCliente(clienteA)
  const listaAposRevogacao = await listarMeusClientes({})
  verificar(
    '13. Acesso direto após revogação é bloqueado',
    acessoAposRevogacao === null &&
      !clienteAposRevogacao.sucesso &&
      !(listaAposRevogacao.dados?.clientes ?? []).some(
        (cliente) => cliente.id === clienteA,
      ),
    clienteAposRevogacao.mensagem,
  )

  // 1 — distinção entre os dois fluxos (contagem final)
  const [membrosDoEscritorio] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.empresaId, escritorio.empresaId),
        eq(empresaMembros.status, 'ativo'),
      ),
    )
  const [colaboracoesAtivas] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(colaboracoesCliente)
    .where(eq(colaboracoesCliente.status, 'aceito'))
  verificar(
    '1. Fluxos distintos: equipe cria membro, colaboração não',
    membrosDoEscritorio.total === 3 && colaboracoesAtivas.total === 2,
    `membros=${membrosDoEscritorio.total} (proprietário, profissional, colaborador) · colaborações ativas=${colaboracoesAtivas.total}`,
  )

  // atribuição interna preservada
  const [atribuicoes] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(clienteAtribuicoes)
    .where(eq(clienteAtribuicoes.clienteId, clienteA))
  verificar(
    '6b. Atribuições internas continuam funcionando',
    atribuicoes.total === 2,
    `atribuições no Cliente A=${atribuicoes.total}`,
  )

  await limparSessoes()

  const falhas = resultados.filter((item) => !item.ok)
  console.log(
    `\n${resultados.length - falhas.length}/${resultados.length} verificações aprovadas.`,
  )
  if (falhas.length) process.exitCode = 1
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  async (erro) => {
    await limparSessoes().catch(() => {})
    console.error(erro instanceof Error ? erro.stack : erro)
    process.exit(1)
  },
)
