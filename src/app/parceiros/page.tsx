import type { Metadata } from "next";
import { buscarPaginaPublicada } from "@/features/cms/queries/publico";
import { PaginaParceiros } from "@/features/parceiros";
import { SLUG_REGRAS_DO_PROGRAMA } from "@/features/parceiros/constants/publico";
import { obterNiveisPublicos } from "@/features/parceiros/lib/niveis";
import { obterSituacaoNaPaginaPublica } from "@/features/parceiros/queries/situacao-publica";

export const metadata: Metadata = {
  title: "Programa de Parceiros Indicadores | Vincis",
  description:
    "Indique a Vincis e receba comissão quando seus indicados contratarem planos contábeis ou serviços pela plataforma. Participação gratuita, níveis, simulador e regras do programa.",
};

/**
 * Lida a cada visita, no servidor.
 *
 * - Níveis: a mesma configuração vigente que o motor usa — uma mudança feita pela
 *   Gestão aparece na próxima visita, sem deploy.
 * - Situação de quem visita: decide para onde o botão "participar" leva.
 * - Regras do programa: página editável no CMS; o link só aparece publicada.
 */
export const dynamic = "force-dynamic";

export default async function ParceirosRoute() {
  const [niveis, situacao, regras] = await Promise.all([
    obterNiveisPublicos(),
    obterSituacaoNaPaginaPublica(),
    buscarPaginaPublicada(SLUG_REGRAS_DO_PROGRAMA).catch(() => null),
  ]);
  return <PaginaParceiros niveis={niveis} situacao={situacao} regrasHref={regras ? `/${regras.slug}` : null} />;
}
