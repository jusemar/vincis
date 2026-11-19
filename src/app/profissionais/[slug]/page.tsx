import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaPerfilPublico } from "@/features/perfis/components/PaginaPerfilPublico";
import { obterPrestadorPeloSlugDaRequisicao } from "@/features/perfis/queries/prestador-pelo-slug";
import { obterSeoDoPerfil } from "@/features/seo";

type Propriedades = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Propriedades): Promise<Metadata> {
  const prestadorId = await obterPrestadorPeloSlugDaRequisicao((await params).slug);
  if (!prestadorId) return { robots: { index: false, follow: true } };
  return (await obterSeoDoPerfil(prestadorId)).metadados;
}

/**
 * `/profissionais/<slug>` — endereço oficial do perfil público.
 *
 * O slug só identifica; quem decide se o perfil abre é a identidade pública
 * (conta ativa, verificada, prestador público), dentro de `PaginaPerfilPublico`.
 * Slug desconhecido ou de cadastro que deixou de ser público → 404.
 */
export default async function PerfilAmigavelRoute({ params }: Propriedades) {
  const prestadorId = await obterPrestadorPeloSlugDaRequisicao((await params).slug);
  if (!prestadorId) notFound();
  return <PaginaPerfilPublico prestadorId={prestadorId} exigirPerfilPublico />;
}
