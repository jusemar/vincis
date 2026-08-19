/**
 * Contas locais de Colaborador para validar o novo tipo de prestador.
 *
 * São contas descartáveis de desenvolvimento (domínio `@vincis.local`), criadas
 * pelo mesmo caminho que o cadastro real usaria: perfil `colaborador` em
 * `usuarios_perfis` e cadastro de prestador com `tipo_prestador = 'colaborador'`
 * e `status_analise = 'ativo'` — nunca `aprovado`.
 *
 * Uso:
 *   node --env-file=.env --import tsx scripts/desenvolvimento/gerenciar-colaboradores-teste.ts criar
 *   node --env-file=.env --import tsx scripts/desenvolvimento/gerenciar-colaboradores-teste.ts remover
 */
import { eq, inArray } from 'drizzle-orm'
import { db } from '../../src/db/connection'
import {
  clienteAtribuicoes,
  clientes,
  colaboracoesCliente,
  convitesEmpresa,
  empresaMembros,
  perfis,
  perfisProfissionais,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '../../src/db/schema'
import { gerarHash } from '../../src/features/usuarios/lib/hash-senha'
import { STATUS_PRESTADOR_HABILITADO } from '../../src/features/usuarios/constants/prestador'

const SENHA = 'Teste@123456'

export const COLABORADORES_TESTE = [
  {
    email: 'demo.colaborador.paula.ramos@vincis.local',
    nome: 'Paula Ramos',
    nomeAtuacao: 'Paula Ramos',
    apresentacao:
      'Colaboradora local de testes. Atua com rotinas fiscais e declaração de imposto de renda.',
    areasAtuacao: ['declaração de imposto de renda', 'rotinas fiscais'],
    especialidades: ['Imposto de renda pessoa física'],
    cidade: 'Belo Horizonte',
    estado: 'MG',
    telefone: '31988880001',
  },
  {
    email: 'demo.colaborador.tiago.moura@vincis.local',
    nome: 'Tiago Moura',
    nomeAtuacao: 'Tiago Moura',
    apresentacao:
      'Colaborador local de testes. Atua com apoio administrativo e organização de documentos.',
    areasAtuacao: ['apoio administrativo', 'organização de documentos'],
    especialidades: ['Rotinas administrativas'],
    cidade: 'Contagem',
    estado: 'MG',
    telefone: '31988880002',
  },
] as const

const EMAILS = COLABORADORES_TESTE.map(({ email }) => email)

async function criar() {
  const [perfilColaborador] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, 'colaborador'))
    .limit(1)
  if (!perfilColaborador)
    throw new Error(
      'Perfil "colaborador" não encontrado. Rode a migration 0015 ou o seed.',
    )

  for (const dados of COLABORADORES_TESTE) {
    const [existente] = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, dados.email))
      .limit(1)
    if (existente) {
      console.log(`  = já existe: ${dados.email}`)
      continue
    }

    await db.transaction(async (tx) => {
      const [usuario] = await tx
        .insert(usuarios)
        .values({
          nome: dados.nome,
          email: dados.email,
          whatsapp: null,
          senhaHash: await gerarHash(SENHA),
          emailVerificado: true,
          emailVerificadoEm: new Date(),
          status: 'ativo',
        })
        .returning({ id: usuarios.id })

      await tx
        .insert(usuariosPerfis)
        .values({ usuarioId: usuario.id, perfilId: perfilColaborador.id })

      await tx.insert(perfisProfissionais).values({
        usuarioId: usuario.id,
        tipoPrestador: 'colaborador',
        // Colaborador não tem categoria regulamentada.
        tipoProfissional: 'colaborador',
        numeroRegistro: null,
        areasAtuacao: [...dados.areasAtuacao],
        especialidades: [...dados.especialidades],
        apresentacao: dados.apresentacao,
        nomeAtuacao: dados.nomeAtuacao,
        modalidadeAtuacao: 'individual',
        cidade: dados.cidade,
        estado: dados.estado,
        tempoExperiencia: 3,
        telefoneContato: dados.telefone,
        emailProfissional: dados.email,
        statusAnalise: STATUS_PRESTADOR_HABILITADO.colaborador,
        enviadoEm: new Date(),
      })
    })
    console.log(`  + criado: ${dados.email}`)
  }
}

async function remover() {
  const contas = await db
    .select({ id: usuarios.id, email: usuarios.email })
    .from(usuarios)
    .where(inArray(usuarios.email, [...EMAILS]))
  if (!contas.length) return console.log('Nenhuma conta de teste encontrada.')

  const ids = contas.map(({ id }) => id)
  await db.transaction(async (tx) => {
    await tx
      .delete(colaboracoesCliente)
      .where(inArray(colaboracoesCliente.destinatarioId, ids))
    await tx
      .delete(colaboracoesCliente)
      .where(inArray(colaboracoesCliente.remetenteId, ids))
    await tx
      .delete(clienteAtribuicoes)
      .where(inArray(clienteAtribuicoes.profissionalId, ids))
    await tx.delete(clientes).where(inArray(clientes.profissionalId, ids))
    await tx
      .delete(convitesEmpresa)
      .where(inArray(convitesEmpresa.destinatarioId, ids))
    await tx
      .delete(empresaMembros)
      .where(inArray(empresaMembros.usuarioId, ids))
    await tx
      .delete(perfisProfissionais)
      .where(inArray(perfisProfissionais.usuarioId, ids))
    await tx
      .delete(sessoesUsuario)
      .where(inArray(sessoesUsuario.usuarioId, ids))
    await tx.delete(tokensUsuario).where(inArray(tokensUsuario.usuarioId, ids))
    await tx.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
    await tx.delete(usuarios).where(inArray(usuarios.id, ids))
  })
  for (const conta of contas) console.log(`  - removido: ${conta.email}`)
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script não pode ser executado em produção.')
  }
  const acao = process.argv[2] ?? 'criar'
  if (acao === 'criar') return criar()
  if (acao === 'remover') return remover()
  throw new Error(`Ação desconhecida: ${acao}. Use "criar" ou "remover".`)
}

main().then(
  () => process.exit(0),
  (erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  },
)
