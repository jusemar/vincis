import { z } from 'zod'

export const OnboardingEmpresaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(3, 'Informe um nome com pelo menos 3 caracteres')
    .max(255, 'O nome deve ter no máximo 255 caracteres'),
  segmento: z.enum(['advocacia', 'contabilidade'], {
    message: 'Selecione a área de atuação',
  }),
})

export type OnboardingEmpresaDTO = z.infer<typeof OnboardingEmpresaSchema>
