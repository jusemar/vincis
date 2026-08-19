import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  clienteAtribuicoes,
  clientes,
  colaboracoesCliente,
  convitesEmpresa,
  empresaMembros,
  empresas,
  perfis,
  perfisProfissionais,
  sessoesUsuario,
  usuarios,
  usuariosPerfis,
} from '@/db/schema'
import { gerarTokenSessao } from '@/features/usuarios/lib/gerar-token-sessao'

/**
 * Cenário completo da matriz, montado com dados reais.
 *
 * Um escritório ("Escritório Alfa") com Proprietário, dois Administradores (um
 * Profissional e um Colaborador) e dois membros comuns (um de cada tipo). Fora
 * dele, um Profissional sozinho, um Colaborador sozinho, um Gestor Vincis, um
 * colaborador externo convidado para um cliente e um estranho sem vínculo
 * nenhum.
 *
 * Clientes:
 * - `clienteA` pertence ao Proprietário, é atribuído aos dois membros comuns e
 *   compartilhado por colaboração externa aceita.
 * - `clienteB` pertence ao Proprietário e não é atribuído nem compartilhado —
 *   é o alvo das tentativas de acesso indevido.
 * - `clienteSozinho` pertence ao Profissional sozinho, fora de qualquer
 *   escritório.
 * - `clienteColaboradorSozinho` pertence ao Colaborador sozinho, para provar
 *   que Colaborador tem carteira própria sem virar Profissional.
 */

export const PAPEIS_PERSONA = [
  'gestor',
  'profissionalSozinho',
  'colaboradorSozinho',
  'proprietario',
  'adminProfissional',
  'adminColaborador',
  'profissionalMembro',
  'colaboradorMembro',
  'colaboradorExterno',
  'estranho',
] as const

export type Persona = (typeof PAPEIS_PERSONA)[number]

type DefinicaoPersona = {
  perfil: string
  tipoPrestador?: 'profissional' | 'colaborador'
  statusAnalise?: string
}

const DEFINICOES: Record<Persona, DefinicaoPersona> = {
  gestor: { perfil: 'gestor_vincis' },
  profissionalSozinho: {
    perfil: 'profissional',
    tipoPrestador: 'profissional',
    statusAnalise: 'aprovado',
  },
  colaboradorSozinho: {
    perfil: 'colaborador',
    tipoPrestador: 'colaborador',
    statusAnalise: 'ativo',
  },
  proprietario: {
    perfil: 'profissional',
    tipoPrestador: 'profissional',
    statusAnalise: 'aprovado',
  },
  adminProfissional: {
    perfil: 'profissional',
    tipoPrestador: 'profissional',
    statusAnalise: 'aprovado',
  },
  adminColaborador: {
    perfil: 'colaborador',
    tipoPrestador: 'colaborador',
    statusAnalise: 'ativo',
  },
  profissionalMembro: {
    perfil: 'profissional',
    tipoPrestador: 'profissional',
    statusAnalise: 'aprovado',
  },
  colaboradorMembro: {
    perfil: 'colaborador',
    tipoPrestador: 'colaborador',
    statusAnalise: 'ativo',
  },
  colaboradorExterno: {
    perfil: 'colaborador',
    tipoPrestador: 'colaborador',
    statusAnalise: 'ativo',
  },
  estranho: {
    perfil: 'profissional',
    tipoPrestador: 'profissional',
    statusAnalise: 'aprovado',
  },
}

export type Cenario = {
  ids: Record<Persona, string>
  tokens: Record<Persona, string>
  empresaId: string
  clienteA: string
  clienteB: string
  clienteSozinho: string
  clienteColaboradorSozinho: string
  colaboracaoAId: string
}

const SUFIXO = '@matriz.teste'

function emailDe(persona: Persona) {
  return `${persona.toLowerCase()}${SUFIXO}`
}

async function garantirPerfis() {
  const nomes = [
    'cliente',
    'contador',
    'advogado',
    'profissional',
    'colaborador',
    'gestor_vincis',
  ]
  for (const nome of nomes) {
    await db.insert(perfis).values({ nome }).onConflictDoNothing()
  }
  const registros = await db
    .select({ id: perfis.id, nome: perfis.nome })
    .from(perfis)
    .where(inArray(perfis.nome, nomes))
  return new Map(registros.map(({ nome, id }) => [nome, id]))
}

async function criarUsuario(persona: Persona, perfilId: string) {
  const definicao = DEFINICOES[persona]
  const [usuario] = await db
    .insert(usuarios)
    .values({
      nome: persona,
      email: emailDe(persona),
      senhaHash: 'nao-usado-nos-testes',
      emailVerificado: true,
      status: 'ativo',
    })
    .returning({ id: usuarios.id })

  await db.insert(usuariosPerfis).values({ usuarioId: usuario.id, perfilId })

  if (definicao.tipoPrestador) {
    await db.insert(perfisProfissionais).values({
      usuarioId: usuario.id,
      tipoPrestador: definicao.tipoPrestador,
      tipoProfissional:
        definicao.tipoPrestador === 'colaborador' ? 'colaborador' : 'contabilidade',
      numeroRegistro:
        definicao.tipoPrestador === 'profissional' ? 'CRC-000000' : null,
      apresentacao: `Persona de teste ${persona}.`,
      nomeAtuacao: persona,
      modalidadeAtuacao: 'individual',
      cidade: 'São Paulo',
      estado: 'SP',
      telefoneContato: '11999999999',
      emailProfissional: emailDe(persona),
      statusAnalise: definicao.statusAnalise!,
    })
  }

  const { token, hash } = gerarTokenSessao()
  await db.insert(sessoesUsuario).values({
    usuarioId: usuario.id,
    tokenHash: hash,
    expiraEm: new Date(Date.now() + 60 * 60 * 1000),
    userAgent: 'matriz-permissoes',
  })

  return { id: usuario.id, token }
}

async function criarCliente(
  proprietarioId: string,
  empresaId: string | null,
  nome: string,
) {
  const [cliente] = await db
    .insert(clientes)
    .values({
      profissionalId: proprietarioId,
      empresaId,
      nome,
      email: `${nome.replace(/\s+/g, '.').toLowerCase()}${SUFIXO}`,
      telefone: '11988887777',
      area: 'contabil',
      status: 'ativo',
      tipoAtendimento: 'mensal',
      valorReferenciaCentavos: 100000,
      cep: '01310000',
      logradouro: 'Avenida Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
    })
    .returning({ id: clientes.id })
  return cliente.id
}

export async function montarCenario(): Promise<Cenario> {
  await limparCenario()
  const perfilPorNome = await garantirPerfis()

  const ids = {} as Record<Persona, string>
  const tokens = {} as Record<Persona, string>
  for (const persona of PAPEIS_PERSONA) {
    const perfilId = perfilPorNome.get(DEFINICOES[persona].perfil)!
    const criado = await criarUsuario(persona, perfilId)
    ids[persona] = criado.id
    tokens[persona] = criado.token
  }

  const [empresa] = await db
    .insert(empresas)
    .values({
      nome: 'Escritório Alfa',
      tipo: 'prestadora',
      segmento: 'contabilidade',
      status: 'ativo',
    })
    .returning({ id: empresas.id })

  const vinculos: [Persona, string][] = [
    ['proprietario', 'proprietario'],
    ['adminProfissional', 'administrador'],
    ['adminColaborador', 'administrador'],
    ['profissionalMembro', 'profissional'],
    ['colaboradorMembro', 'colaborador'],
  ]
  for (const [persona, funcao] of vinculos) {
    await db.insert(empresaMembros).values({
      empresaId: empresa.id,
      usuarioId: ids[persona],
      funcao,
      status: 'ativo',
    })
  }

  // O proprietário também carrega o vínculo legado em `usuarios.empresa_id`,
  // como acontece quando o escritório é criado pelo onboarding.
  await db
    .update(usuarios)
    .set({ empresaId: empresa.id })
    .where(eq(usuarios.id, ids.proprietario))

  const clienteA = await criarCliente(ids.proprietario, empresa.id, 'Cliente A')
  const clienteB = await criarCliente(ids.proprietario, empresa.id, 'Cliente B')
  const clienteSozinho = await criarCliente(
    ids.profissionalSozinho,
    null,
    'Cliente do Profissional Sozinho',
  )
  const clienteColaboradorSozinho = await criarCliente(
    ids.colaboradorSozinho,
    null,
    'Cliente do Colaborador Sozinho',
  )

  for (const persona of ['profissionalMembro', 'colaboradorMembro'] as const) {
    await db.insert(clienteAtribuicoes).values({
      clienteId: clienteA,
      empresaId: empresa.id,
      profissionalId: ids[persona],
      atribuidoPorId: ids.proprietario,
    })
  }

  const [colaboracao] = await db
    .insert(colaboracoesCliente)
    .values({
      clienteId: clienteA,
      escopo: 'cliente',
      origem: 'escritorio',
      empresaOrigemId: empresa.id,
      remetenteId: ids.proprietario,
      destinatarioId: ids.colaboradorExterno,
      status: 'aceito',
      respondidoEm: new Date(),
      expiraEm: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: colaboracoesCliente.id })

  return {
    ids,
    tokens,
    empresaId: empresa.id,
    clienteA,
    clienteB,
    clienteSozinho,
    clienteColaboradorSozinho,
    colaboracaoAId: colaboracao.id,
  }
}

/** Remove tudo que a suíte cria, na ordem das dependências. */
export async function limparCenario() {
  const alvos = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(inArray(usuarios.email, PAPEIS_PERSONA.map(emailDe)))
  const ids = alvos.map(({ id }) => id)
  if (!ids.length) return

  const clientesAlvo = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(inArray(clientes.profissionalId, ids))
  const clienteIds = clientesAlvo.map(({ id }) => id)

  if (clienteIds.length) {
    await db
      .delete(colaboracoesCliente)
      .where(inArray(colaboracoesCliente.clienteId, clienteIds))
    await db
      .delete(clienteAtribuicoes)
      .where(inArray(clienteAtribuicoes.clienteId, clienteIds))
    await db.delete(clientes).where(inArray(clientes.id, clienteIds))
  }

  await db
    .delete(convitesEmpresa)
    .where(inArray(convitesEmpresa.destinatarioId, ids))
  await db.delete(empresaMembros).where(inArray(empresaMembros.usuarioId, ids))
  await db.update(usuarios).set({ empresaId: null }).where(inArray(usuarios.id, ids))
  await db.delete(empresas).where(eq(empresas.nome, 'Escritório Alfa'))
  await db.delete(sessoesUsuario).where(inArray(sessoesUsuario.usuarioId, ids))
  await db
    .delete(perfisProfissionais)
    .where(inArray(perfisProfissionais.usuarioId, ids))
  await db.delete(usuariosPerfis).where(inArray(usuariosPerfis.usuarioId, ids))
  await db.delete(usuarios).where(inArray(usuarios.id, ids))
}
