import { redirect } from 'next/navigation'
import { listarAtendimentosDoCliente } from '@/features/atendimentos/queries/listar-atendimentos-do-cliente'
import { listarConsultoriasDoCliente } from '@/features/consultorias/queries/agendamentos'
import { VisaoGeralCliente } from '@/features/portal-cliente/components/secoes/VisaoGeralCliente'
import {
  ROTA_DA_ABA_LEGADA,
  ROTA_CLIENTE,
} from '@/features/portal-cliente/constants/navegacao'
import { rotaDaSecao } from '@/features/parceiros/constants/navegacao'
import { listarOportunidadesDoCliente } from '@/features/oportunidades/queries/listar-oportunidades-do-cliente'
import { listarMinhasContratacoes } from '@/features/servicos/actions/contratacoes'
import { exigirClienteDaSessao } from '@/features/portal-cliente/lib/sessao-do-cliente'

/**
 * Visão geral — a abertura da Área do Cliente.
 *
 * ## URLs antigas
 *
 * A navegação por `?aba=` foi substituída por páginas de verdade. Links já
 * compartilhados (e o histórico de quem usa) continuam funcionando: quando o
 * parâmetro chega, esta página redireciona para a rota equivalente, preservando
 * os parâmetros que são de fato da página de destino (`?pagar=`, `?filtro=`,
 * `?atendimento=`). Não há dois sistemas de navegação convivendo — só uma porta
 * de entrada que reencaminha.
 */
export default async function ClienteRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parametros = await searchParams
  const texto = (chave: string) => {
    const valor = parametros[chave]
    return Array.isArray(valor) ? valor[0] : valor
  }

  const aba = texto('aba')
  if (aba) redirect(destinoLegado(aba, texto('secao'), parametros))

  const { usuarioId, dados } = await exigirClienteDaSessao()

  const [contratacoes, atendimentos, consultorias, oportunidades] =
    await Promise.all([
      listarMinhasContratacoes(),
      // Recorte do Cliente: só os atendimentos dele, sem conversa interna nem
      // eventos internos — o filtro acontece no SQL da consulta.
      listarAtendimentosDoCliente(usuarioId),
      // As consultorias com hora marcada. O recorte é do SQL — `cliente_usuario_id
      // = sessão` —, então nenhuma consultoria de outra pessoa chega ao navegador.
      listarConsultoriasDoCliente(usuarioId),
      // Solicitações do próprio Cliente, com as propostas recebidas. O recorte
      // por dono está no SQL da consulta — comparar propostas é ato dele.
      listarOportunidadesDoCliente(usuarioId),
    ])

  return (
    <VisaoGeralCliente
      nome={dados.nome}
      oportunidades={oportunidades}
      atendimentos={atendimentos}
      /**
       * As futuras e um punhado das encerradas.
       *
       * Uma consultoria concluída sai de `futuras` no instante em que o horário
       * passa — mas é justamente nesse momento que o Cliente precisa dela na
       * tela: para ver que foi concluída e para avaliar. O corte em três é o que
       * impede o bloco de virar um arquivo; o histórico completo continua sendo
       * o Atendimento, que tem tela própria para isso.
       */
      consultorias={[...consultorias.futuras, ...consultorias.passadas.slice(0, 3)]}
      contratacoes={contratacoes.dados ?? []}
    />
  )
}

/** Para onde um `?aba=` antigo aponta hoje. */
function destinoLegado(
  aba: string,
  secao: string | undefined,
  parametros: Record<string, string | string[] | undefined>,
): string {
  const base =
    aba === 'parceiros'
      ? rotaDaSecao(secao ?? 'dashboard')
      : (ROTA_DA_ABA_LEGADA[aba] ?? ROTA_CLIENTE)

  // Só o que continua sendo parâmetro da página de destino atravessa.
  const preservados = new URLSearchParams()
  for (const chave of ['pagar', 'filtro', 'atendimento']) {
    const valor = parametros[chave]
    const primeiro = Array.isArray(valor) ? valor[0] : valor
    if (primeiro) preservados.set(chave, primeiro)
  }

  const query = preservados.toString()
  return query ? `${base}?${query}` : base
}
