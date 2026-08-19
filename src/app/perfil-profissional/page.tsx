import PerfilProfissionalV2 from "@/features/perfis/components/PerfilProfissionalV2";
import { obterIdentidadePublica } from "@/features/servicos/queries/identidade-publica";
import { listarServicosPublicos } from "@/features/servicos/queries/vitrine-publica";

type PerfilProfissionalRouteProps = {
  searchParams: Promise<{ prestador?: string | string[] }>;
};

/**
 * Perfil público do prestador.
 *
 * Com `?prestador=<id>` a seção `Serviços disponíveis` passa a listar o
 * catálogo real daquele prestador (somente ativos e públicos). Sem o parâmetro,
 * a página segue exibindo a vitrine de demonstração — o layout é o mesmo nos
 * dois casos.
 */
export default async function PerfilProfissionalRoute({
  searchParams,
}: PerfilProfissionalRouteProps) {
  const params = await searchParams;
  const prestadorId = Array.isArray(params.prestador)
    ? params.prestador[0]
    : params.prestador;

  const identidade = prestadorId
    ? ((await obterIdentidadePublica(prestadorId)) ?? undefined)
    : undefined;

  const servicos = prestadorId
    ? (await listarServicosPublicos(prestadorId)).map((servico) => ({
        id: servico.id,
        name: servico.title,
        desc: servico.description,
        price: servico.price,
        chips: servico.chips,
        note: servico.priceNote,
        action: servico.cta,
        outline: servico.isOrcamento,
      }))
    : undefined;

  return <PerfilProfissionalV2 identidade={identidade} servicos={servicos} />;
}
