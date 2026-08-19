import type { ColumnDef, Status } from '../types/atendimentos';
import { IDENTIDADE_STATUS } from './status-atendimento';

/**
 * Colunas do quadro.
 *
 * Título e cor saem do mapa único de identidade dos status — a bolinha da
 * coluna é a mesma cor do badge do card, por construção e não por coincidência.
 * `recusado` e `cancelado` continuam fora do quadro, alcançáveis pelo filtro.
 */
const COLUNAS_DO_QUADRO: Status[] = [
  "novo",
  "andamento",
  "aguardando-cliente",
  "aguardando-assinatura",
  "concluido",
];

export const COLUMNS: ColumnDef[] = COLUNAS_DO_QUADRO.map((id) => ({
  id,
  title: IDENTIDADE_STATUS[id].rotulo,
  accent: IDENTIDADE_STATUS[id].ponto,
}));

/**
 * Status que existem no fluxo mas não têm coluna no quadro.
 *
 * Derivado de `COLUNAS_DO_QUADRO`, e não escrito de novo: se um status ganhar
 * coluna amanhã, ele sai daqui sozinho. É esta lista que a tela consulta para
 * saber que filtrar por Recusado ou Cancelado no Kanban não mostraria card
 * nenhum — e por isso a vista precisa virar Lista.
 */
export const STATUS_SEM_COLUNA: Status[] = (
  Object.keys(IDENTIDADE_STATUS) as Status[]
).filter((status) => !COLUNAS_DO_QUADRO.includes(status));
