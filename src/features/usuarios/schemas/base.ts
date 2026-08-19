import { z } from 'zod'

export const emailSchema = z.string().email('E-mail inválido')

export const senhaSchema = z.string().min(6, 'Senha deve ter no mínimo 6 caracteres')

export const whatsappSchema = z
  .string()
  .min(10, 'WhatsApp deve ter no mínimo 10 caracteres')
  .max(20, 'WhatsApp deve ter no máximo 20 caracteres')

export const nomeSchema = z
  .string()
  .min(3, 'Nome deve ter no mínimo 3 caracteres')
