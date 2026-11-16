import ProfessionalsPage from "@/features/profissionais/components/ProfessionalsPage";
import { lerAbrirOrcamento, lerAreaBusca } from "@/features/profissionais/constants/busca-url";

/**
 * Busca pública de profissionais.
 *
 * Aceita `?area=contabilidade|advocacia` (busca já filtrada) e `?orcamento=1`
 * (pedido de orçamento aberto) — os destinos do rodapé. A `key` recria a tela
 * quando o filtro da URL muda sem sair da página (ex.: clicar outro link do
 * rodapé estando na busca).
 */
export default async function ProfissionaisRoute({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[]; orcamento?: string | string[] }>;
}) {
  const parametros = await searchParams;
  const area = lerAreaBusca(parametros.area);
  const abrirOrcamento = lerAbrirOrcamento(parametros.orcamento);
  return (
    <ProfessionalsPage
      key={`${area ?? "todas"}-${abrirOrcamento ? "orcamento" : "busca"}`}
      areaInicial={area}
      abrirOrcamento={abrirOrcamento}
    />
  );
}
