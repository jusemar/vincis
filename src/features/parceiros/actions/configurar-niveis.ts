'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ROTA_PARCEIROS } from '@/features/portal-cliente/constants/navegacao'
import { SEM_AUTORIZACAO } from '@/features/usuarios/constants/autorizacao'
import { ehGestorPlataforma } from '@/features/usuarios/lib/gestor-plataforma'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import { lerPercentualEmCentesimos, publicarConfiguracaoDeNiveis } from '../lib/niveis'

const ROTA_PARCEIROS_ADMIN = '/admin/parceiros'

/** Número inteiro vindo de campo de formulário ou de chamada direta. */
const Inteiro = z.union([
  z.number(),
  z.string().trim().regex(/^\d+$/, 'Informe números inteiros, sem sinal.'),
]).transform(Number)

const ConfiguracaoSchema = z.object({
  protecaoDias: Inteiro,
  niveis: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(20),
        minimoClientes: Inteiro,
        percentual: z.string().trim().min(1, 'Informe o percentual de cada nível.'),
      }),
    )
    .min(1),
})

/**
 * A Gestão publica a configuração dos níveis do Programa de Parceiros.
 *
 * ## Só a Gestão
 *
 * Esconder o formulário não protege nada: esta action confere a sessão e o
 * perfil de Gestor antes de ler a entrada. Cliente, parceiro e profissional sem
 * Gestor recebem a mesma recusa de qualquer outra operação da Gestão.
 *
 * ## O que muda, e o que não muda
 *
 * Grava uma versão nova — percentuais, mínimos e proteção. Vale para as
 * comissões que nascerem daqui em diante e para as próximas mudanças de nível.
 * Comissão já gerada fica com o percentual congelado nela; proteção já
 * concedida fica com a data que tinha. A publicação é auditada com a versão
 * anterior e a nova.
 */
export async function salvarConfiguracaoDeNiveis(entrada: unknown) {
  const sessao = await obterSessaoServidor()
  if (!sessao || !ehGestorPlataforma(sessao)) return SEM_AUTORIZACAO

  const validacao = ConfiguracaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return {
      sucesso: false as const,
      mensagem: validacao.error.issues[0]?.message ?? 'Configuração inválida.',
    }
  }

  const regras = []
  for (const nivel of validacao.data.niveis) {
    const centesimos = lerPercentualEmCentesimos(nivel.percentual)
    if (centesimos === null) {
      return {
        sucesso: false as const,
        mensagem: 'Percentual inválido: use até duas casas decimais, entre 0% e 100%.',
      }
    }
    regras.push({
      codigo: nivel.codigo,
      minimoClientes: nivel.minimoClientes,
      percentualCentesimos: centesimos,
    })
  }

  const resultado = await publicarConfiguracaoDeNiveis({
    protecaoDias: validacao.data.protecaoDias,
    regras,
    autorId: sessao.id,
  })
  if (!resultado.ok) return { sucesso: false as const, mensagem: resultado.mensagem }

  revalidatePath(ROTA_PARCEIROS_ADMIN)
  revalidatePath(ROTA_PARCEIROS, 'layout')
  return {
    sucesso: true as const,
    mensagem: resultado.inalterada
      ? 'Nada mudou: a configuração vigente já é esta.'
      : `Configuração publicada (versão ${resultado.versao}). Vale para novas comissões e próximas mudanças de nível.`,
  }
}
