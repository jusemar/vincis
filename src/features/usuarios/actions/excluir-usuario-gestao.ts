'use server'

import { excluirUsuarioSeguro } from '../lib/excluir-usuario-seguro'
import { validarGestorVincis } from '../lib/validar-gestor-vincis'
import { UsuarioGestaoIdSchema } from '../schemas/gestao-usuarios'
import type { ResultadoPadrao } from '../types'

export async function excluirUsuarioGestao(usuarioId: string): Promise<ResultadoPadrao> {
  const gestor = await validarGestorVincis()
  const id = UsuarioGestaoIdSchema.safeParse(usuarioId)
  if (!gestor || !id.success) return { sucesso: false, mensagem: 'Operação não autorizada.' }
  if (gestor.id === id.data) return { sucesso: false, mensagem: 'Você não pode excluir sua própria conta.' }
  return excluirUsuarioSeguro(id.data)
}
