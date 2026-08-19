import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db/connection'
import {
  empresaMembros,
  empresas,
  perfisProfissionais,
  usuarios,
} from '@/db/schema'
import { ehPessoaProfissional } from '@/features/usuarios/lib/prestador'
import { buscarPerfilPrincipalUsuario } from '@/features/usuarios/queries/buscar-perfil-principal-usuario'
import type { ContextoEmpresa, SegmentoEmpresa } from '../types'

function segmentoDoProfissional(tipoProfissional: string): SegmentoEmpresa {
  return tipoProfissional === 'advocacia' ? 'advocacia' : 'contabilidade'
}

/**
 * Cria (ou recupera) o escritório de quem escolheu atuar como escritório.
 *
 * Proprietário de escritório é obrigatoriamente uma pessoa do tipo Profissional
 * com cadastro aprovado — um escritório de contabilidade precisa de um contador
 * responsável. Colaborador nunca passa por aqui: ele participa de escritórios
 * pelo convite de equipe, não como dono.
 */
export async function garantirEscritorioProfissional(
  usuarioId: string,
): Promise<ContextoEmpresa | null> {
  const perfilPrincipal = await buscarPerfilPrincipalUsuario(usuarioId)
  if (!ehPessoaProfissional(perfilPrincipal)) return null

  return db.transaction(async (tx): Promise<ContextoEmpresa | null> => {
    // O lock torna criação e recuperação atômicas mesmo em acessos concorrentes.
    await tx.execute(
      sql`select id from usuarios where id = ${usuarioId} for update`,
    )

    const [perfil] = await tx
      .select({
        tipoPrestador: perfisProfissionais.tipoPrestador,
        modalidade: perfisProfissionais.modalidadeAtuacao,
        nome: perfisProfissionais.nomeAtuacao,
        tipoProfissional: perfisProfissionais.tipoProfissional,
        status: perfisProfissionais.statusAnalise,
      })
      .from(perfisProfissionais)
      .where(eq(perfisProfissionais.usuarioId, usuarioId))
      .limit(1)

    // Cadastro profissional aprovado é condição de propriedade de escritório.
    if (
      !perfil ||
      perfil.tipoPrestador !== 'profissional' ||
      perfil.status !== 'aprovado' ||
      perfil.modalidade !== 'escritorio'
    ) {
      return null
    }

    const [contextoExistente] = await tx
      .select({
        empresaId: empresas.id,
        membroId: empresaMembros.id,
        nome: empresas.nome,
        segmento: empresas.segmento,
      })
      .from(empresaMembros)
      .innerJoin(empresas, eq(empresas.id, empresaMembros.empresaId))
      .where(
        and(
          eq(empresaMembros.usuarioId, usuarioId),
          eq(empresaMembros.status, 'ativo'),
          eq(empresas.status, 'ativo'),
        ),
      )
      .limit(1)

    if (contextoExistente) {
      await tx
        .update(usuarios)
        .set({ empresaId: contextoExistente.empresaId, updatedAt: new Date() })
        .where(eq(usuarios.id, usuarioId))
      return contextoExistente
    }

    const [qualquerVinculo] = await tx
      .select({ id: empresaMembros.id })
      .from(empresaMembros)
      .where(eq(empresaMembros.usuarioId, usuarioId))
      .limit(1)

    if (qualquerVinculo) {
      throw new Error('VINCULO_EMPRESARIAL_INATIVO')
    }

    const [usuario] = await tx
      .select({ empresaId: usuarios.empresaId })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1)

    let empresa = usuario?.empresaId
      ? (
          await tx
            .select({
              id: empresas.id,
              nome: empresas.nome,
              segmento: empresas.segmento,
            })
            .from(empresas)
            .where(
              and(
                eq(empresas.id, usuario.empresaId),
                eq(empresas.status, 'ativo'),
              ),
            )
            .limit(1)
        )[0]
      : undefined

    if (!empresa) {
      const [empresaCriada] = await tx
        .insert(empresas)
        .values({
          nome: perfil.nome,
          tipo: 'prestadora',
          segmento: segmentoDoProfissional(perfil.tipoProfissional),
          status: 'ativo',
        })
        .returning({
          id: empresas.id,
          nome: empresas.nome,
          segmento: empresas.segmento,
        })
      empresa = empresaCriada
    }

    if (!empresa) throw new Error('EMPRESA_NAO_CRIADA')

    const [membro] = await tx
      .insert(empresaMembros)
      .values({
        empresaId: empresa.id,
        usuarioId,
        funcao: 'proprietario',
        status: 'ativo',
      })
      .returning({ id: empresaMembros.id })

    if (!membro) throw new Error('MEMBRO_NAO_CRIADO')

    await tx
      .update(usuarios)
      .set({ empresaId: empresa.id, updatedAt: new Date() })
      .where(eq(usuarios.id, usuarioId))

    return {
      empresaId: empresa.id,
      membroId: membro.id,
      nome: empresa.nome,
      segmento: empresa.segmento,
    }
  })
}
