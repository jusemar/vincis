import { z } from 'zod'

export const schemaLogin = z.object({
  email: z.string().min(1, 'Informe seu e-mail ou WhatsApp'),
  senha: z.string().min(1, 'Informe sua senha'),
})

export const schemaEsqueciSenha = z.object({
  email: z.string().min(1, 'Informe seu e-mail ou WhatsApp'),
})

export const schemaCadastro = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('E-mail inválido'),
  telefone: z.string().min(10, 'Telefone inválido'),
  senha: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  confirmarSenha: z.string().min(1, 'Confirme sua senha'),
}).refine((dados) => dados.senha === dados.confirmarSenha, {
  message: 'Senhas não conferem',
  path: ['confirmarSenha'],
})
