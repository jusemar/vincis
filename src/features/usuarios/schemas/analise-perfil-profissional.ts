import { z } from 'zod'

export const AnalisePerfilProfissionalSchema = z.object({
  usuarioId: z.string().uuid(),
  decisao: z.enum(['aprovado', 'correcao_solicitada', 'rejeitado']),
  mensagem: z.string().trim().max(2000, 'A mensagem deve ter no máximo 2.000 caracteres.').default(''),
}).superRefine((dados, contexto) => {
  if (dados.decisao !== 'aprovado' && dados.mensagem.length < 10) {
    contexto.addIssue({ code: 'custom', path: ['mensagem'], message: 'Explique o motivo com pelo menos 10 caracteres.' })
  }
})

