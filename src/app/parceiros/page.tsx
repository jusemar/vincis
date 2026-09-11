import { PaginaParceiros } from "@/features/parceiros";
import { obterNiveisPublicos } from "@/features/parceiros/lib/niveis";

/**
 * A trilha de níveis é lida a cada visita, no servidor.
 *
 * Sem isto o Next pré-renderizaria a página no `build`, e os percentuais e
 * mínimos mostrados seriam os do momento do deploy — uma mudança feita pela
 * Gestão só apareceria no deploy seguinte. É a mesma razão de `/precos`: a
 * leitura é uma consulta a três tabelas minúsculas.
 */
export const dynamic = "force-dynamic";

export default async function ParceirosRoute() {
  const niveis = await obterNiveisPublicos();
  return <PaginaParceiros niveis={niveis} />;
}
