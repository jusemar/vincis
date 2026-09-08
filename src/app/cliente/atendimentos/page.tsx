import { listarAtendimentosDoCliente } from '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
import { AtendimentosDoCliente } from '@/features/portal-cliente/components/AtendimentosDoCliente'
import { exigirClienteDaSessao } from '@/features/portal-cliente/lib/sessao-do-cliente'

/**
 * Atendimentos: o trabalho contratado em andamento.
 *
 * `?atendimento=` continua na query porque é parâmetro desta página — o deep
 * link que abre um protocolo específico, vindo do sino, da Visão geral e da
 * confirmação de consultoria. Aceita id ou protocolo, como sempre aceitou.
 */
export default async function AtendimentosRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { usuarioId } = await exigirClienteDaSessao()

  const parametros = await searchParams
  const inicial = parametros.atendimento
  const atendimentoInicial = Array.isArray(inicial) ? inicial[0] : inicial

  return (
    <AtendimentosDoCliente
      atendimentos={await listarAtendimentosDoCliente(usuarioId)}
      atendimentoInicial={atendimentoInicial ?? null}
    />
  )
}
