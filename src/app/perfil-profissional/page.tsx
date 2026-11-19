import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { PaginaPerfilPublico } from "@/features/perfis/components/PaginaPerfilPublico";
import { resolverRedirecionamentoPerfilLegado } from "@/features/perfis/lib/redirecionamento-perfil";
import { obterSeoDoPerfil } from "@/features/seo";

type PerfilProfissionalRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Primeiro valor de `?prestador=` (a URL pode repetir o parâmetro). */
function lerPrestador(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Metadados do formato antigo. Perfil público é redirecionado antes de chegar
 * aqui; o que sobra (vitrine de demonstração, cadastro não público) recebe
 * `noindex` pela regra de `features/seo`.
 */
export async function generateMetadata({
  searchParams,
}: PerfilProfissionalRouteProps): Promise<Metadata> {
  const { metadados } = await obterSeoDoPerfil(
    lerPrestador((await searchParams).prestador),
  );
  return metadados;
}

/**
 * `/perfil-profissional?prestador=<id>` — o endereço antigo do perfil.
 *
 * Continua válido para sempre: indicações (`/p/<codigo>?d=…`), oportunidades,
 * e-mails e links já compartilhados apontam para cá. Quando o prestador tem
 * perfil público, responde 308 para `/profissionais/<slug>`, levando junto os
 * demais parâmetros da URL (`?entrar=1`, retomadas de login). Sem prestador,
 * segue sendo a vitrine de demonstração.
 */
export default async function PerfilProfissionalRoute({
  searchParams,
}: PerfilProfissionalRouteProps) {
  const parametros = await searchParams;
  const prestadorId = lerPrestador(parametros.prestador);

  const destino = await resolverRedirecionamentoPerfilLegado(prestadorId, parametros);
  if (destino) permanentRedirect(destino);

  return <PaginaPerfilPublico prestadorId={prestadorId} />;
}
