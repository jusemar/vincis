'use server'

import { validarGestorVincis } from '@/features/usuarios/lib/validar-gestor-vincis'
import {
  listarConsultoriasGestao,
  obterConsultoriaGestao,
} from '../queries/gestao-consultorias'
import {
  BuscaConsultoriasGestaoSchema,
  ConsultoriaGestaoIdSchema,
} from '../schemas/gestao-consultorias'
import type {
  ConsultoriaGestaoDTO,
  DetalheConsultoriaGestaoDTO,
} from '../types/gestao-consultorias'

/**
 * A porta da Gestão para as consultorias.
 *
 * ## A guarda vem antes de tudo
 *
 * `validarGestorVincis` é a primeira linha das duas funções — antes da
 * validação da entrada, antes de qualquer consulta. Não é estilo: é o que
 * garante que um id de consultoria enviado por quem não é Gestão jamais chegue
 * ao banco. A mesma função que a tela de usuários usa; não há uma segunda regra
 * de permissão nesta etapa.
 *
 * ## Só leitura
 *
 * Não existe aqui nenhuma função que escreva. Cancelar, remarcar, concluir e
 * avaliar continuam sendo do Cliente e do Profissional — a Gestão observa a
 * operação, não atua no lugar de quem contratou.
 */

const VAZIO = {
  consultorias: [] as ConsultoriaGestaoDTO[],
  total: 0,
  pagina: 1,
  totalPaginas: 1,
}

export async function buscarConsultoriasGestao(entrada: unknown): Promise<
  | { sucesso: true; consultorias: ConsultoriaGestaoDTO[]; total: number; pagina: number; totalPaginas: number }
  | { sucesso: false; mensagem: string; consultorias: ConsultoriaGestaoDTO[]; total: number; pagina: number; totalPaginas: number }
> {
  const gestor = await validarGestorVincis()
  if (!gestor) {
    return { sucesso: false, mensagem: 'Acesso não autorizado.', ...VAZIO }
  }

  const validacao = BuscaConsultoriasGestaoSchema.safeParse(entrada)
  if (!validacao.success) {
    return { sucesso: false, mensagem: 'Busca inválida.', ...VAZIO }
  }

  return { sucesso: true, ...(await listarConsultoriasGestao(validacao.data)) }
}

export async function abrirConsultoriaGestao(
  agendamentoId: unknown,
): Promise<
  | { sucesso: true; dados: DetalheConsultoriaGestaoDTO }
  | { sucesso: false; mensagem: string; dados: null }
> {
  const gestor = await validarGestorVincis()
  if (!gestor) {
    return { sucesso: false, mensagem: 'Acesso não autorizado.', dados: null }
  }

  const validacao = ConsultoriaGestaoIdSchema.safeParse(agendamentoId)
  if (!validacao.success) {
    return { sucesso: false, mensagem: 'Consultoria inválida.', dados: null }
  }

  const dados = await obterConsultoriaGestao(validacao.data)
  if (!dados) {
    return { sucesso: false, mensagem: 'Consultoria não encontrada.', dados: null }
  }
  return { sucesso: true, dados }
}
