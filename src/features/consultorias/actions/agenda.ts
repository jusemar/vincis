'use server'

import { z } from 'zod'
import { obterSessaoServidor } from '@/features/usuarios/lib/sessao-servidor'
import {
  listarHorariosDoDia,
  obterAgendaDoMes,
} from '../queries/agenda-publica'
import { DataLocalSchema, PrestadorIdSchema } from '../schemas/consultoria'
import type { AgendaDoDiaDTO, AgendaDoMesDTO } from '../types/consultoria'

/**
 * A agenda pública, chamada pelo card do perfil.
 *
 * ## Por que Server Actions, e não rotas
 *
 * O card é um componente de cliente e precisa de dados novos ao trocar de mês
 * ou escolher um dia. Server Action é o caminho que o projeto já usa para isso;
 * uma rota de API traria uma segunda superfície pública para o mesmo dado, com
 * autorização própria para manter em acordo com a primeira.
 *
 * ## Sem sessão obrigatória, e isso é deliberado
 *
 * O perfil do Profissional é público, e ver a agenda é parte de decidir se vale
 * contratar. Exigir login para *olhar* afastaria justamente quem ainda não tem
 * conta. Nada aqui escreve: são duas leituras que devolvem exatamente o que o
 * perfil já mostra — preço, duração e horários livres. A conta é exigida na
 * hora de contratar, não na hora de olhar.
 *
 * A sessão é **lida** quando existe, por um motivo só: a reserva temporária do
 * próprio Cliente não pode sumir da tela dele. Quem reservou 14:00 e atualiza a
 * página precisa continuar vendo 14:00 como o horário dele — se a própria
 * reserva o escondesse, o Cliente perderia o acesso ao que acabou de reservar e
 * ficaria esperando dez minutos para tentar de novo. Para todo o resto do
 * mundo, aquele horário está ocupado.
 *
 * ## O que não atravessa
 *
 * Nenhum dado de outro Cliente, nenhum agendamento alheio e nenhum motivo de
 * exceção: as consultas por trás selecionam só o que é público. O `prestadorId`
 * é o mesmo id que já está na URL da página. E o intervalo é sempre recortado
 * ao horizonte da consultoria, então pedir um mês distante devolve mês vazio em
 * vez de varrer o banco.
 */

const AgendaDoMesSchema = z.object({
  prestadorId: PrestadorIdSchema,
  ano: z.coerce.number().int().min(1970).max(9999),
  mes: z.coerce.number().int().min(1).max(12),
})

const HorariosSchema = z.object({
  prestadorId: PrestadorIdSchema,
  data: DataLocalSchema,
})

/** Estado vazio devolvido quando a entrada não faz sentido. Nunca uma exceção. */
function mesVazio(ano: number, mes: number): AgendaDoMesDTO {
  return { consultoria: null, mes: { ano, mes }, dias: [], hoje: null, ultimoDia: null }
}

export async function buscarAgendaDoMes(entrada: unknown): Promise<AgendaDoMesDTO> {
  const validacao = AgendaDoMesSchema.safeParse(entrada)
  if (!validacao.success) return mesVazio(1970, 1)

  const { prestadorId, ano, mes } = validacao.data
  const sessao = await obterSessaoServidor()
  return obterAgendaDoMes({
    prestadorId,
    mes: { ano, mes },
    ignorarClienteId: sessao?.id,
  })
}

export async function buscarHorariosDaData(
  entrada: unknown,
): Promise<AgendaDoDiaDTO> {
  const validacao = HorariosSchema.safeParse(entrada)
  if (!validacao.success) {
    return { consultoria: null, data: '', horarios: [] }
  }
  const sessao = await obterSessaoServidor()
  return listarHorariosDoDia({ ...validacao.data, ignorarClienteId: sessao?.id })
}
