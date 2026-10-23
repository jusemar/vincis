import type { z } from 'zod'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import type { ResultadoCms } from '../nucleo/types'

/**
 * Peças comuns das actions do CMS. Ficam fora dos arquivos `'use server'`
 * porque esses só podem exportar actions.
 */
export const CMS_SEM_AUTORIZACAO: ResultadoCms<never> = SEM_AUTORIZACAO

/** Primeira falha de validação, com o campo, para o formulário marcar. */
export function falhaDeValidacao(erro: z.ZodError): ResultadoCms<never> {
  const primeira = erro.issues[0]
  const campo = primeira?.path[0]
  return {
    sucesso: false,
    mensagem: primeira?.message ?? 'Dados inválidos.',
    ...(typeof campo === 'string' ? { campo } : {}),
  }
}

/**
 * O erro (ou uma das causas) é violação do índice único informado?
 *
 * O Drizzle embrulha o erro do Postgres, e o `23505` fica uma ou duas camadas
 * abaixo — por isso a cadeia de `cause` é percorrida.
 */
export function violouRestricaoUnica(erro: unknown, restricao: string) {
  let atual: unknown = erro
  for (let nivel = 0; atual && nivel < 5; nivel += 1) {
    const { code, constraint_name: nome } = atual as { code?: string; constraint_name?: string }
    if (code === '23505' && nome === restricao) return true
    atual = (atual as { cause?: unknown }).cause
  }
  return false
}
