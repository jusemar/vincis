import { eq } from 'drizzle-orm'
import { db } from '@/db/connection'
import { empresaMembros, perfis, perfisProfissionais, sessoesUsuario, tokensUsuario, usuarios, usuariosPerfis } from '@/db/schema'
import { PERFIL_GESTOR_VINCIS } from '../constants/perfis'
import type { ResultadoPadrao } from '../types'
import { removerComprovanteComCompensacao } from './comprovante-profissional'

export async function excluirUsuarioSeguro(usuarioId: string): Promise<ResultadoPadrao> {
  let restaurarComprovante: (() => Promise<void>) | null = null
  try {
    return await db.transaction(async (tx) => {
      const [usuario] = await tx.select({ empresaId: usuarios.empresaId }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1).for('update')
      if (!usuario) return { sucesso: false, mensagem: 'Usuário não encontrado.' }

      const perfisUsuario = await tx.select({ nome: perfis.nome }).from(usuariosPerfis)
        .innerJoin(perfis, eq(perfis.id, usuariosPerfis.perfilId)).where(eq(usuariosPerfis.usuarioId, usuarioId))
      if (perfisUsuario.some(({ nome }) => nome === PERFIL_GESTOR_VINCIS)) return { sucesso: false, mensagem: 'Contas gestoras não podem ser excluídas.' }

      const [vinculo] = await tx.select({ id: empresaMembros.id }).from(empresaMembros).where(eq(empresaMembros.usuarioId, usuarioId)).limit(1)
      if (usuario.empresaId || vinculo) return { sucesso: false, mensagem: 'A conta possui empresa ou vínculo empresarial e deve ser desativada.' }

      const [perfilProfissional] = await tx.select({ comprovante: perfisProfissionais.comprovanteRegistroChave })
        .from(perfisProfissionais).where(eq(perfisProfissionais.usuarioId, usuarioId)).limit(1)
      if (perfilProfissional?.comprovante) restaurarComprovante = await removerComprovanteComCompensacao(perfilProfissional.comprovante)

      await tx.delete(sessoesUsuario).where(eq(sessoesUsuario.usuarioId, usuarioId))
      await tx.delete(tokensUsuario).where(eq(tokensUsuario.usuarioId, usuarioId))
      await tx.delete(usuariosPerfis).where(eq(usuariosPerfis.usuarioId, usuarioId))
      await tx.delete(perfisProfissionais).where(eq(perfisProfissionais.usuarioId, usuarioId))
      await tx.delete(usuarios).where(eq(usuarios.id, usuarioId))
      return { sucesso: true, mensagem: 'Conta excluída definitivamente.' }
    })
  } catch {
    if (restaurarComprovante) await (restaurarComprovante as () => Promise<void>)().catch(() => undefined)
    return { sucesso: false, mensagem: 'Não foi possível excluir a conta. Nenhum dado foi removido.' }
  }
}

