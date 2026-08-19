import { eq, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import { empresaMembros, empresas, perfisProfissionais } from '@/db/schema'
import type { OnboardingEmpresaDTO } from '../schemas/onboarding-empresa'
import type { ContextoEmpresa } from '../types'

export const ERRO_USUARIO_JA_POSSUI_EMPRESA = 'USUARIO_JA_POSSUI_EMPRESA'
export const ERRO_PROPRIETARIO_SEM_PERFIL_PROFISSIONAL =
  'PROPRIETARIO_SEM_PERFIL_PROFISSIONAL'

export async function criarEmpresaComMembro(
  usuarioId: string,
  dados: OnboardingEmpresaDTO,
): Promise<ContextoEmpresa> {
  return db.transaction(async (tx): Promise<ContextoEmpresa> => {
    // Serializa o onboarding do mesmo usuário para impedir criação duplicada.
    await tx.execute(sql`select id from usuarios where id = ${usuarioId} for update`)

    // Proprietário de escritório é obrigatoriamente Profissional aprovado.
    // Sem esta verificação nascia exatamente a inconsistência que motivou a
    // regularização por script: membership de proprietário sem cadastro
    // profissional nenhum, e depois um perfil "aprovado" criado só para
    // destravar o roteamento.
    const [perfilProfissional] = await tx
      .select({
        tipoPrestador: perfisProfissionais.tipoPrestador,
        statusAnalise: perfisProfissionais.statusAnalise,
      })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, usuarioId))
      .limit(1)

    if (
      perfilProfissional?.tipoPrestador !== 'profissional' ||
      perfilProfissional.statusAnalise !== 'aprovado'
    ) {
      throw new Error(ERRO_PROPRIETARIO_SEM_PERFIL_PROFISSIONAL)
    }

    const [vinculoExistente] = await tx
      .select({ id: empresaMembros.id })
      .from(empresaMembros)
      .where(eq(empresaMembros.usuarioId, usuarioId))
      .limit(1)

    if (vinculoExistente) {
      throw new Error(ERRO_USUARIO_JA_POSSUI_EMPRESA)
    }

    const [empresa] = await tx
      .insert(empresas)
      .values({
        nome: dados.nome,
        tipo: 'prestadora',
        segmento: dados.segmento,
        status: 'ativo',
      })
      .returning({
        id: empresas.id,
        nome: empresas.nome,
        segmento: empresas.segmento,
      })

    if (!empresa) {
      throw new Error('EMPRESA_NAO_CRIADA')
    }

    const [membro] = await tx
      .insert(empresaMembros)
      .values({
        empresaId: empresa.id,
        usuarioId,
        funcao: 'proprietario',
        status: 'ativo',
      })
      .returning({ id: empresaMembros.id })

    if (!membro) {
      throw new Error('MEMBRO_NAO_CRIADO')
    }

    return {
      empresaId: empresa.id,
      membroId: membro.id,
      nome: empresa.nome,
      segmento: empresa.segmento,
    }
  })
}
