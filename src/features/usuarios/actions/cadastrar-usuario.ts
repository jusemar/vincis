import { db } from '@/db/connection'
import { usuarios } from '@/db/schema'
import { perfis } from '@/db/schema'
import { usuariosPerfis } from '@/db/schema'
import { CadastroUsuarioSchema, type CadastroUsuarioDTO } from '../schemas/cadastro'
import { gerarHash } from '../lib/hash-senha'
import { buscarUsuarioPorEmail } from '../queries/buscar-usuario-por-email'
import { criarTokenConfirmacao } from '../queries/criar-token-confirmacao'
import { eq } from 'drizzle-orm'
import type { ResultadoPadrao, DadosToken } from '../types'

export type ResultadoCadastro = ResultadoPadrao & {
  dados?: DadosToken
}

export async function cadastrarUsuario(dados: CadastroUsuarioDTO): Promise<ResultadoCadastro> {
  const validated = CadastroUsuarioSchema.safeParse(dados)

  if (!validated.success) {
    return {
      sucesso: false,
      mensagem: 'Dados inválidos',
    }
  }

  const { nome, email, whatsapp, senha, perfilTipo } = validated.data

  const usuarioExistente = await buscarUsuarioPorEmail(email)

  if (usuarioExistente) {
    return {
      sucesso: false,
      mensagem: 'E-mail já cadastrado',
    }
  }

  const perfilExistente = await db
    .select({ id: perfis.id })
    .from(perfis)
    .where(eq(perfis.nome, perfilTipo))
    .limit(1)

  if (!perfilExistente[0]) {
    return {
      sucesso: false,
      mensagem: `Perfil "${perfilTipo}" não encontrado`,
    }
  }

  const senhaHash = await gerarHash(senha)

  const usuarioInserido = await db
    .insert(usuarios)
    .values({
      nome,
      email,
      whatsapp,
      senhaHash,
      status: 'pendente_email',
      emailVerificado: false,
      empresaId: null,
    })
    .returning({ id: usuarios.id })

  const usuarioId = usuarioInserido[0].id

  await db.insert(usuariosPerfis).values({
    usuarioId,
    perfilId: perfilExistente[0].id,
  })

  const token = await criarTokenConfirmacao(usuarioId)

  const expiraEm = new Date()
  expiraEm.setHours(expiraEm.getHours() + 24)

  return {
    sucesso: true,
    mensagem: 'Cadastro realizado com sucesso',
    dados: {
      token,
      expiraEm,
    },
  }
}
