import { DIAS_INATIVO, ROTULO_ALERTA, ROTULO_SITUACAO } from '../lib/andamento'
import { listarAtendimentosAbertosComAndamento } from '../lib/atendimentos-parados'

export type AtendimentoParadoDTO = {
  id: string
  protocolo: string
  titulo: string
  prestadorNome: string
  clienteNome: string
  situacao: string
  alerta: string | null
  emRevisao: boolean
  diasSemInteracao: number
  ultimaInteracaoEm: string
  prazoEm: string | null
  prazoVencido: boolean
}

/** Teto da fila: os mais parados primeiro. */
const LIMITE_FILA = 100

/**
 * A fila da Gestão: Atendimentos abertos há 7+ dias sem interação real.
 *
 * Usa a mesma derivação da rotina diária e da tela do Cliente — o que aparece
 * aqui como "Em revisão pela Vincis" é exatamente o que o Cliente lê. Quem
 * chama já passou pela guarda do Gestor.
 */
export async function listarAtendimentosParados(agora = new Date()) {
  const abertos = await listarAtendimentosAbertosComAndamento(agora)
  const parados = abertos
    .filter((item) => item.andamento.diasSemInteracao >= DIAS_INATIVO)
    .sort((a, b) => b.andamento.diasSemInteracao - a.andamento.diasSemInteracao)

  return {
    total: parados.length,
    itens: parados.slice(0, LIMITE_FILA).map(
      (item): AtendimentoParadoDTO => ({
        id: item.id,
        protocolo: item.protocolo,
        titulo: item.titulo,
        prestadorNome: item.prestadorNome,
        clienteNome: item.clienteNome,
        situacao: item.andamento.situacao ? ROTULO_SITUACAO[item.andamento.situacao] : '—',
        alerta: item.andamento.alerta ? ROTULO_ALERTA[item.andamento.alerta] : null,
        emRevisao: item.andamento.alerta === 'em_revisao',
        diasSemInteracao: item.andamento.diasSemInteracao,
        ultimaInteracaoEm: item.andamento.ultimaInteracaoEm.toISOString(),
        prazoEm: item.prazoEm?.toISOString() ?? null,
        prazoVencido: item.andamento.prazoVencido,
      }),
    ),
  }
}
