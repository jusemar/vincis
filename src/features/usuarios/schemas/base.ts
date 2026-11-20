import { z } from 'zod'
import { normalizarCelularBR } from '../lib/telefone'

export const emailSchema = z.string().email('E-mail inválido')

export const senhaSchema = z.string().min(6, 'Senha deve ter no mínimo 6 caracteres')

/**
 * Celular brasileiro (WhatsApp/SMS). Aceita qualquer máscara ou +55 e grava
 * sempre DDD + número, só dígitos — regra única em `lib/telefone.ts`.
 */
export const whatsappSchema = z
  .string()
  .trim()
  .transform((valor, contexto) => {
    const nacional = normalizarCelularBR(valor)
    if (!nacional) {
      contexto.addIssue({ code: 'custom', message: 'Informe um celular válido com DDD, ex.: (31) 99999-9999' })
      return z.NEVER
    }
    return nacional
  })

export const nomeSchema = z
  .string()
  .min(3, 'Nome deve ter no mínimo 3 caracteres')
