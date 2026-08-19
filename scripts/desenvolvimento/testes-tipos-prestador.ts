/**
 * Testes de desenvolvimento da separação Profissional × Colaborador.
 *
 * Executa as server actions reais (o mesmo código da interface) com a sessão
 * simulada pelos stubs de `next/headers`, cobrindo os sete casos da regra:
 *
 *  1. Profissional atuando sozinho
 *  2. Profissional vira proprietário de escritório
 *  3. Profissional entra em equipe
 *  4. Colaborador independente
 *  5. Colaborador entra no escritório
 *  6. Convite incompatível (papel × tipo)
 *  7. Colaboração externa e revogação
 *
 * Pré-requisitos:
 *   node --env-file=.env --import tsx scripts/desenvolvimento/gerenciar-colaboradores-teste.ts criar
 *
 * Uso:
 *   node --env-file=.env --import tsx --import ./scripts/desenvolvimento/_registrar-hooks.mjs \
 *     scripts/desenvolvimento/testes-tipos-prestador.ts
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
  perfisProfissionais,
  sessoesUsuario,
  usuarios,
} from '../../src/db/schema'
import { gerarTokenSessao } from '../../src/features/usuarios/lib/gerar-token-sessao'
import { gerarHash } from '../../src/features/usuarios/lib/hash-senha'
import { perfis, usuariosPerfis } from '../../src/db/schema'

const {
  carregarEquipe,
  enviarConviteEmpresa,
  responderConviteEmpresa,
  alterarAtribuicaoCliente,
} = await import('../../src/features/empresas/actions/equipe')
const { enviarConviteColaboracao, responderConviteColaboracao, revogarColaboracao } =
  await import('../../src/features/clientes/actions/colaboracoes')
const { criarCliente, listarMeusClientes, obterMeuCliente } = await import(
  '../../src/features/clientes/actions/clientes'
)
const { resolverAcessoCliente } = await import(
  '../../src/features/clientes/lib/acesso-cliente'
)
const { resolverAcessoUsuario } = await import(
  '../../src/features/usuarios/queries/obter-destino-apos-login'
)
const { pesquisarProfissionaisReais } = await import(
  '../../src/features/profissionais/queries/pesquisar-profissionais'
)
const { salvarPerfilColaborador } = await import(
  '../../src/features/usuarios/actions/salvar-perfil-colaborador'
)
const { salvarPerfilProfissional } = await import(
  '../../src/features/usuarios/actions/salvar-perfil-profissional'
)
const { resolverContextoTenant } = await import(
  '../../src/features/empresas/lib/resolver-contexto-tenant'
)

const EMAILS = {
  proprietario: 'jusemarrjunior@gmail.com',
  // Conta sem nenhum vínculo de escritório: é o caso "atua sozinho".
  profissionalSozinho: 'demo.profissional.roberto.almeida@vincis.local',
  profissionalEquipe: 'demo.profissional.ana.silva@vincis.local',
  profissionalExterno: 'demo.profissional.ricardo.mendes@vincis.local',
  colaborador: 'demo.colaborador.paula.ramos@vincis.local',
  colaborador2: 'demo.colaborador.tiago.moura@vincis.local',
} as const

type Papel = keyof typeof EMAILS

const USER_AGENT = 'testes-tipos-prestador'
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
    if (!usuario)
      throw new Error(
        `Conta de teste ausente: ${email}. Rode gerenciar-colaboradores-teste.ts criar.`,
      )
    ids[papel] = usuario.id
    const { token, hash } = gerarTokenSessao()
    await db.insert(sessoesUsuario).values({
      usuarioId: usuario.id,
      tokenHash: hash,
      expiraEm: new Date(Date.now() + 60 * 60 * 1000),
      userAgent: USER_AGENT,
    })
    tokens[papel] = token
  }
}

function entrarComo(papel: Papel) {
  sessaoAtual.token = tokens[papel]
}

async function limparSessoes() {
  await db.delete(sessoesUsuario).where(eq(sessoesUsuario.userAgent, USER_AGENT))
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

/** Devolve o cenário ao estado inicial, removendo só o que este script cria. */
async function reiniciarCenario(empresaId: string) {
  const convidados = [
    ids.profissionalEquipe,
    ids.colaborador,
    ids.colaborador2,
    ids.profissionalExterno,
  ]
  await db
    .delete(colaboracoesCliente)
    .where(inArray(colaboracoesCliente.destinatarioId, convidados))
  await db
    .delete(colaboracoesCliente)
    .where(inArray(colaboracoesCliente.remetenteId, convidados))
  await db
    .delete(clienteAtribuicoes)
    .where(inArray(clienteAtribuicoes.profissionalId, convidados))
  await db
    .delete(clientes)
    .where(
      inArray(clientes.profissionalId, [ids.colaborador, ids.profissionalSozinho]),
    )
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

async function convidar(
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
  const [convite] = await db
    .select({ id: convitesEmpresa.id })
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

const CLIENTE_BASE = {
  telefone: '31999990000',
  empresaNome: '',
  area: 'contabil' as const,
  status: 'ativo' as const,
  tipoAtendimento: 'mensal' as const,
  valorReferencia: '500,00',
  observacoes: '',
  cep: '30140071',
  logradouro: 'Avenida Afonso Pena',
  numero: '1000',
  complemento: '',
  bairro: 'Centro',
  cidade: 'Belo Horizonte',
  estado: 'MG',
}

async function garantirCliente(
  dono: Papel,
  nome: string,
  tipoAtendimento: 'mensal' | 'avulso' = 'mensal',
) {
  const [existente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.profissionalId, ids[dono]), eq(clientes.nome, nome)))
    .limit(1)
  if (existente) return existente.id

  entrarComo(dono)
  const criacao = await criarCliente({
    ...CLIENTE_BASE,
    tipoAtendimento,
    nome,
    email: `${nome.toLowerCase().replaceAll(/[^a-z0-9]/g, '')}@teste.local`,
  })
  if (!criacao.sucesso) throw new Error(`Não criou ${nome}: ${criacao.mensagem}`)
  const [criado] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(and(eq(clientes.profissionalId, ids[dono]), eq(clientes.nome, nome)))
    .limit(1)
  return criado.id
}

const EMAIL_NOVO_COLABORADOR = 'demo.colaborador.novo@vincis.local'

async function removerContaNova() {
  const [conta] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, EMAIL_NOVO_COLABORADOR))
    .limit(1)
  if (!conta) return
  await db
    .delete(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, conta.id))
  await db.delete(sessoesUsuario).where(eq(sessoesUsuario.usuarioId, conta.id))
  await db.delete(usuariosPerfis).where(eq(usuariosPerfis.usuarioId, conta.id))
  await db.delete(usuarios).where(eq(usuarios.id, conta.id))
}

/**
 * Cria uma conta do zero pelo mesmo caminho do cadastro (perfil `colaborador`
 * em `usuarios_perfis`, sem nenhuma linha em `perfis_profissionais`) e percorre
 * a porta de entrada inteira até o /admin.
 */
async function portaDeEntradaDoColaborador() {
  await removerContaNova()
  const [perfilColaborador] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, 'colaborador'))
    .limit(1)
  if (!perfilColaborador) throw new Error('Perfil "colaborador" ausente.')

  const [conta] = await db
    .insert(usuarios)
    .values({
      nome: 'Colaborador Recem Criado',
      email: EMAIL_NOVO_COLABORADOR,
      whatsapp: null,
      senhaHash: await gerarHash('Teste@123456'),
      emailVerificado: true,
      emailVerificadoEm: new Date(),
      status: 'ativo',
    })
    .returning({ id: usuarios.id })
  await db
    .insert(usuariosPerfis)
    .values({ usuarioId: conta.id, perfilId: perfilColaborador.id })

  const antes = await resolverAcessoUsuario(conta.id)
  verificar(
    '9a. Conta nova de Colaborador vai para /cadastro-colaborador',
    antes?.destino === '/cadastro-colaborador' &&
      antes.tipoPrestador === 'colaborador',
    `destino=${antes?.destino}`,
  )

  const { token, hash } = gerarTokenSessao()
  await db.insert(sessoesUsuario).values({
    usuarioId: conta.id,
    tokenHash: hash,
    expiraEm: new Date(Date.now() + 60 * 60 * 1000),
    userAgent: USER_AGENT,
  })
  sessaoAtual.token = token

  // O cadastro profissional precisa recusar esta conta: ela não é Profissional.
  const tentativaProfissional = await salvarPerfilProfissional({
    tipoProfissional: 'contabilidade',
    numeroRegistro: '123456',
    areasAtuacao: 'fiscal',
    apresentacao: 'Tentativa indevida de cadastro profissional por colaborador.',
    nomeAtuacao: '',
    modalidadeAtuacao: 'individual',
    cep: '30140071',
    logradouro: 'Avenida Afonso Pena',
    numero: '1000',
    complemento: '',
    bairro: 'Centro',
    cidade: 'Belo Horizonte',
    estado: 'MG',
    tempoExperiencia: 1,
    regimesAtendidos: [],
    telefoneContato: '31988887777',
    emailProfissional: EMAIL_NOVO_COLABORADOR,
  })
  verificar(
    '9b. Colaborador não consegue preencher o cadastro profissional',
    !tentativaProfissional.sucesso,
    tentativaProfissional.mensagem,
  )

  const salvamento = await salvarPerfilColaborador({
    nomeAtuacao: 'Colaborador Recem Criado',
    areasAtuacao: 'declaração de imposto de renda',
    apresentacao:
      'Perfil criado pelo fluxo real do cadastro de colaborador nos testes.',
    cidade: 'Belo Horizonte',
    estado: 'MG',
    tempoExperiencia: 2,
    telefoneContato: '31988887777',
    emailProfissional: EMAIL_NOVO_COLABORADOR,
    regimesAtendidos: [],
  })
  const depois = await resolverAcessoUsuario(conta.id)
  const [perfilCriado] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      statusAnalise: perfisProfissionais.statusAnalise,
      numeroRegistro: perfisProfissionais.numeroRegistro,
      cep: perfisProfissionais.cep,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, conta.id))
    .limit(1)
  verificar(
    '9c. Após salvar o perfil de colaborador, a conta entra em /admin',
    salvamento.sucesso &&
      depois?.destino === '/admin' &&
      perfilCriado?.tipoPrestador === 'colaborador' &&
      perfilCriado.statusAnalise === 'ativo' &&
      perfilCriado.numeroRegistro === null &&
      perfilCriado.cep === null,
    `status=${perfilCriado?.statusAnalise} registro=${perfilCriado?.numeroRegistro} cep=${perfilCriado?.cep}`,
  )

  await removerContaNova()
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script não pode ser executado em produção.')
  }

  await prepararSessoes()
  const escritorio = await empresaDoProprietario()
  await reiniciarCenario(escritorio.empresaId)

  // ── Caso 1 — Profissional atuando sozinho ────────────────────────────────
  const acessoSozinho = await resolverAcessoUsuario(ids.profissionalSozinho)
  verificar(
    '1a. Profissional sozinho é do tipo Profissional e entra em /admin',
    acessoSozinho?.destino === '/admin' &&
      acessoSozinho.tipoPrestador === 'profissional',
    `destino=${acessoSozinho?.destino} tipo=${acessoSozinho?.tipoPrestador}`,
  )
  await garantirCliente('profissionalSozinho', 'Cliente mensal do solo', 'mensal')
  await garantirCliente('profissionalSozinho', 'Cliente avulso do solo', 'avulso')
  const [semEscritorio] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.usuarioId, ids.profissionalSozinho),
        eq(empresaMembros.status, 'ativo'),
      ),
    )
  entrarComo('profissionalSozinho')
  const clientesSozinho = await listarMeusClientes({})
  const tiposAtendimento = new Set(
    (clientesSozinho.dados?.clientes ?? []).map(
      (cliente) => cliente.tipoAtendimento,
    ),
  )
  verificar(
    '1b. Profissional sozinho tem clientes próprios (avulso e mensal), sem escritório',
    semEscritorio.total === 0 &&
      tiposAtendimento.has('mensal') &&
      tiposAtendimento.has('avulso'),
    `clientes=${clientesSozinho.dados?.clientes.length ?? 0} tipos=${[...tiposAtendimento].join('/')}`,
  )

  // ── Caso 2 — Profissional que é Proprietário ─────────────────────────────
  const acessoProprietario = await resolverAcessoUsuario(ids.proprietario)
  const [vinculoProprietario] = await db
    .select({ funcao: empresaMembros.funcao })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.usuarioId, ids.proprietario),
        eq(empresaMembros.empresaId, escritorio.empresaId),
      ),
    )
    .limit(1)
  verificar(
    '2. Proprietário continua do tipo Profissional; proprietário é papel',
    acessoProprietario?.tipoPrestador === 'profissional' &&
      acessoProprietario.destino === '/admin' &&
      vinculoProprietario?.funcao === 'proprietario',
    `tipo=${acessoProprietario?.tipoPrestador} papel=${vinculoProprietario?.funcao}`,
  )

  // ── Caso 3 — Profissional entra em equipe ────────────────────────────────
  const conviteProfissional = await convidar(
    escritorio.empresaId,
    'profissionalEquipe',
    'profissional',
  )
  verificar(
    '3a. Convite de Profissional como Profissional é aceito pelo servidor',
    conviteProfissional.envio.sucesso,
    conviteProfissional.envio.mensagem,
  )
  entrarComo('profissionalEquipe')
  const aceiteProfissional = conviteProfissional.conviteId
    ? await responderConviteEmpresa({
        conviteId: conviteProfissional.conviteId,
        resposta: 'aceitar',
      })
    : { sucesso: false, mensagem: 'sem convite' }
  const acessoMembroProfissional = await resolverAcessoUsuario(
    ids.profissionalEquipe,
  )
  verificar(
    '3b. Profissional entra na equipe e continua do tipo Profissional',
    aceiteProfissional.sucesso &&
      acessoMembroProfissional?.tipoPrestador === 'profissional',
    `tipo=${acessoMembroProfissional?.tipoPrestador}`,
  )

  // ── Caso 4 — Colaborador independente ────────────────────────────────────
  const [perfilColaborador] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      statusAnalise: perfisProfissionais.statusAnalise,
      numeroRegistro: perfisProfissionais.numeroRegistro,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, ids.colaborador))
    .limit(1)
  const acessoColaborador = await resolverAcessoUsuario(ids.colaborador)
  verificar(
    '4a. Colaborador entra em /admin sem perfil profissional aprovado',
    acessoColaborador?.destino === '/admin' &&
      acessoColaborador.tipoPrestador === 'colaborador' &&
      perfilColaborador?.statusAnalise !== 'aprovado' &&
      perfilColaborador?.numeroRegistro === null,
    `destino=${acessoColaborador?.destino} status=${perfilColaborador?.statusAnalise} registro=${perfilColaborador?.numeroRegistro}`,
  )
  verificar(
    '4b. Colaborador não é enviado para /cadastro-profissional',
    acessoColaborador?.destino !== '/cadastro-profissional',
    `destino=${acessoColaborador?.destino}`,
  )
  const vitrinePublica = await pesquisarProfissionaisReais({ porPagina: 30 })
  verificar(
    '4c. Colaborador não aparece na vitrine pública de profissionais',
    !vitrinePublica.profissionais.some((item) => item.id === ids.colaborador),
    `profissionais listados=${vitrinePublica.profissionais.length}`,
  )
  const clienteDoColaborador = await garantirCliente(
    'colaborador',
    'Cliente proprio do colaborador',
  )
  entrarComo('colaborador')
  const clientesColaborador = await listarMeusClientes({})
  verificar(
    '4d. Colaborador pode ter cliente próprio',
    (clientesColaborador.dados?.clientes ?? []).some(
      (cliente) => cliente.id === clienteDoColaborador,
    ),
    `clientes=${clientesColaborador.dados?.clientes.length ?? 0}`,
  )

  // ── Caso 6 — Convite incompatível (antes do caso 5, para provar a recusa) ─
  const conviteIncompativel = await convidar(
    escritorio.empresaId,
    'colaborador',
    'profissional',
  )
  verificar(
    '6a. Convidar Colaborador como Profissional é recusado no servidor',
    !conviteIncompativel.envio.sucesso && conviteIncompativel.conviteId === null,
    conviteIncompativel.envio.mensagem,
  )
  const conviteInverso = await convidar(
    escritorio.empresaId,
    'profissionalExterno',
    'colaborador',
  )
  verificar(
    '6b. Convidar Profissional como Colaborador é recusado no servidor',
    !conviteInverso.envio.sucesso && conviteInverso.conviteId === null,
    conviteInverso.envio.mensagem,
  )

  // ── Caso 5 — Colaborador entra no escritório ─────────────────────────────
  const conviteColaborador = await convidar(
    escritorio.empresaId,
    'colaborador',
    'colaborador',
  )
  verificar(
    '5a. Convite de Colaborador como Colaborador é aceito pelo servidor',
    conviteColaborador.envio.sucesso,
    conviteColaborador.envio.mensagem,
  )
  entrarComo('colaborador')
  const aceiteColaborador = conviteColaborador.conviteId
    ? await responderConviteEmpresa({
        conviteId: conviteColaborador.conviteId,
        resposta: 'aceitar',
      })
    : { sucesso: false, mensagem: 'sem convite' }
  const [membroColaborador] = await db
    .select({ funcao: empresaMembros.funcao, status: empresaMembros.status })
    .from(empresaMembros)
    .where(
      and(
        eq(empresaMembros.empresaId, escritorio.empresaId),
        eq(empresaMembros.usuarioId, ids.colaborador),
      ),
    )
    .limit(1)
  const [perfilAposAceite] = await db
    .select({
      tipoPrestador: perfisProfissionais.tipoPrestador,
      statusAnalise: perfisProfissionais.statusAnalise,
    })
    .from(perfisProfissionais)
    .where(eq(perfisProfissionais.usuarioId, ids.colaborador))
    .limit(1)
  verificar(
    '5b. Colaborador vira membro com papel Colaborador, sem perfil fictício',
    aceiteColaborador.sucesso &&
      membroColaborador?.funcao === 'colaborador' &&
      membroColaborador.status === 'ativo' &&
      perfilAposAceite?.tipoPrestador === 'colaborador' &&
      perfilAposAceite.statusAnalise !== 'aprovado',
    `papel=${membroColaborador?.funcao} tipo=${perfilAposAceite?.tipoPrestador} status=${perfilAposAceite?.statusAnalise}`,
  )
  const equipeColaborador = await carregarEquipe()
  verificar(
    '5c. Colaborador abre a área de Equipe e enxerga o escritório',
    equipeColaborador.sucesso &&
      Boolean(
        equipeColaborador.dados?.escritorios.some(
          (item) => item.empresaId === escritorio.empresaId,
        ),
      ),
    equipeColaborador.mensagem,
  )
  const conviteIndevido = await enviarConviteEmpresa({
    empresaId: escritorio.empresaId,
    destinatarioId: ids.colaborador2,
    funcao: 'colaborador',
  })
  verificar(
    '5d. Colaborador membro não envia convite permanente de equipe',
    !conviteIndevido.sucesso,
    conviteIndevido.mensagem,
  )

  // ── Caso 7 — Colaboração externa ─────────────────────────────────────────
  const clienteA = await garantirCliente('proprietario', 'Cliente A colaboracao')
  const clienteB = await garantirCliente('proprietario', 'Cliente B reservado')

  entrarComo('proprietario')
  const atribuicao = await alterarAtribuicaoCliente({
    empresaId: escritorio.empresaId,
    clienteId: clienteA,
    profissionalId: ids.colaborador,
    atribuir: true,
  })
  verificar(
    '7a. Colaborador membro recebe cliente atribuído',
    atribuicao.sucesso,
    atribuicao.mensagem,
  )

  entrarComo('colaborador')
  const pedidoAjuda = await enviarConviteColaboracao({
    clienteId: clienteA,
    destinatarioId: ids.profissionalExterno,
  })
  verificar(
    '7b. Colaborador pede ajuda a um Profissional no cliente atribuído',
    pedidoAjuda.sucesso,
    pedidoAjuda.mensagem,
  )

  const [colaboracao] = await db
    .select({ id: colaboracoesCliente.id })
    .from(colaboracoesCliente)
    .where(
      and(
        eq(colaboracoesCliente.clienteId, clienteA),
        eq(colaboracoesCliente.destinatarioId, ids.profissionalExterno),
        eq(colaboracoesCliente.status, 'pendente'),
      ),
    )
    .limit(1)

  entrarComo('profissionalExterno')
  const aceiteColaboracao = await responderConviteColaboracao({
    colaboracaoId: colaboracao.id,
    resposta: 'aceitar',
  })
  const listaExterno = await listarMeusClientes({})
  const idsExterno = (listaExterno.dados?.clientes ?? []).map(({ id }) => id)
  const clienteNegado = await obterMeuCliente(clienteB)
  verificar(
    '7c. Convidado acessa só o Cliente A e não vira membro da equipe',
    aceiteColaboracao.sucesso &&
      idsExterno.includes(clienteA) &&
      !idsExterno.includes(clienteB) &&
      !clienteNegado.sucesso &&
      (await contarMembros(escritorio.empresaId, ids.profissionalExterno)) === 0,
    `clientes visíveis=${idsExterno.length}`,
  )

  entrarComo('colaborador')
  const revogacao = await revogarColaboracao({ colaboracaoId: colaboracao.id })
  entrarComo('profissionalExterno')
  const acessoAposRevogacao = await resolverAcessoCliente(
    ids.profissionalExterno,
    clienteA,
  )
  const clienteAposRevogacao = await obterMeuCliente(clienteA)
  verificar(
    '7d. Revogação bloqueia o acesso imediatamente',
    revogacao.sucesso &&
      acessoAposRevogacao === null &&
      !clienteAposRevogacao.sucesso,
    clienteAposRevogacao.mensagem,
  )

  // ── Isolamento: colaborador não enxerga o cliente do outro colaborador ───
  entrarComo('colaborador2')
  const acessoColaborador2 = await resolverAcessoUsuario(ids.colaborador2)
  const listaColaborador2 = await listarMeusClientes({})
  verificar(
    '8. Colaborador sem vínculo não enxerga clientes alheios',
    acessoColaborador2?.destino === '/admin' &&
      !(listaColaborador2.dados?.clientes ?? []).some((cliente) =>
        [clienteA, clienteB, clienteDoColaborador].includes(cliente.id),
      ),
    `clientes visíveis=${listaColaborador2.dados?.clientes.length ?? 0}`,
  )

  // ── Contexto de tenant do Colaborador ───────────────────────────────────
  const contextoColaborador = await resolverContextoTenant(ids.colaborador2)
  verificar(
    '8b. Colaborador sem escritório não é levado ao onboarding de empresa',
    contextoColaborador.estado === 'colaborador',
    `estado=${contextoColaborador.estado}`,
  )
  const contextoMembro = await resolverContextoTenant(ids.colaborador)
  verificar(
    '8c. Colaborador membro recebe o contexto do escritório',
    contextoMembro.estado === 'ativo' &&
      contextoMembro.contexto?.empresaId === escritorio.empresaId,
    `estado=${contextoMembro.estado}`,
  )

  // ── Porta de entrada: conta nova de Colaborador, do zero ────────────────
  await portaDeEntradaDoColaborador()

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
