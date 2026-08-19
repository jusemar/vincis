import { eq } from 'drizzle-orm'
import { db } from '../../src/db/connection'
import {
  clientes,
  empresaMembros,
  perfis,
  perfisProfissionais,
  sessoesUsuario,
  tokensUsuario,
  usuarios,
  usuariosPerfis,
} from '../../src/db/schema'
import { gerarHash } from '../../src/features/usuarios/lib/hash-senha'

const EMAIL = 'profissiona@teste.com'
const SENHA = 'Teste@123456'

async function criar() {
  const [perfilBase] = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, 'profissional'))
    .limit(1)
  if (!perfilBase) throw new Error('Perfil profissional base não encontrado.')

  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, EMAIL))
    .limit(1)

  if (existente) {
    console.log(`Conta local já disponível: ${EMAIL}`)
    return
  }

  await db.transaction(async (tx) => {
    const [usuario] = await tx
      .insert(usuarios)
      .values({
        nome: 'Profissional de Teste',
        email: EMAIL,
        whatsapp: null,
        senhaHash: await gerarHash(SENHA),
        emailVerificado: true,
        emailVerificadoEm: new Date(),
        status: 'ativo',
      })
      .returning({ id: usuarios.id })

    await tx
      .insert(usuariosPerfis)
      .values({ usuarioId: usuario.id, perfilId: perfilBase.id })
    await tx.insert(perfisProfissionais).values({
      usuarioId: usuario.id,
      tipoProfissional: 'especialista_fiscal',
      areasAtuacao: ['Consultoria fiscal'],
      apresentacao:
        'Perfil local descartável para validação das funcionalidades da plataforma.',
      nomeAtuacao: 'Profissional de Teste',
      modalidadeAtuacao: 'individual',
      cep: '30140071',
      logradouro: 'Avenida Afonso Pena',
      numero: '1000',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      estado: 'MG',
      tempoExperiencia: 5,
      regimesAtendidos: ['simples_nacional'],
      telefoneContato: '31999999999',
      emailProfissional: EMAIL,
      statusAnalise: 'aprovado',
      enviadoEm: new Date(),
      analisadoEm: new Date(),
    })
  })

  console.log(`Conta local criada: ${EMAIL}`)
}

async function remover() {
  const [usuario] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.email, EMAIL))
    .limit(1)
  if (!usuario) {
    console.log(`Conta local já está ausente: ${EMAIL}`)
    return
  }

  const [vinculoEmpresa] = await db
    .select({ id: empresaMembros.id })
    .from(empresaMembros)
    .where(eq(empresaMembros.usuarioId, usuario.id))
    .limit(1)
  if (vinculoEmpresa) {
    throw new Error('A conta possui vínculo empresarial e não será removida.')
  }

  await db.transaction(async (tx) => {
    await tx.delete(clientes).where(eq(clientes.profissionalId, usuario.id))
    await tx
      .delete(sessoesUsuario)
      .where(eq(sessoesUsuario.usuarioId, usuario.id))
    await tx
      .delete(tokensUsuario)
      .where(eq(tokensUsuario.usuarioId, usuario.id))
    await tx
      .delete(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, usuario.id))
    await tx
      .delete(usuariosPerfis)
      .where(eq(usuariosPerfis.usuarioId, usuario.id))
    await tx.delete(usuarios).where(eq(usuarios.id, usuario.id))
  })

  console.log(`Conta local removida: ${EMAIL}`)
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este script não pode ser executado em produção.')
  }

  const operacao = process.argv[2]
  if (operacao === 'criar') return criar()
  if (operacao === 'remover') return remover()
  throw new Error('Use uma operação válida: criar ou remover.')
}

main().then(() => process.exit(0), (erro) => {
  console.error(erro instanceof Error ? erro.message : erro)
  process.exit(1)
})
