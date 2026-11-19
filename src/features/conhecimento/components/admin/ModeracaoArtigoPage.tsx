import Link from "next/link";
import { ExternalLink, Eye } from "lucide-react";
import {
  ROTA_GESTAO_CONHECIMENTO,
  caminhoArtigo,
  caminhoPreviaArtigo,
} from "../../constants/rotas";
import { descricaoDoAutor, formatarData } from "../../lib/apresentacao";
import type { PainelCardsHomeDoArtigo } from "../../queries/destaques-home";
import type { ArtigoEmEdicao } from "../../queries/privado";
import type { ArtigoCompleto } from "../../types/artigo";
import { SecaoCardsHome } from "../editor/campos/SecaoCardsHome";
import { FormularioArtigo } from "../editor/FormularioArtigo";
import { HistoricoEditorial } from "../HistoricoEditorial";
import { ConteudoArtigo } from "../publico/ConteudoArtigo";
import { SituacaoEditorialBadge } from "../SituacaoEditorialBadge";
import { PainelModeracao } from "./PainelModeracao";

type Decisao = Parameters<typeof PainelModeracao>[0]["disponiveis"][number];

/** Decisões possíveis no estado atual (a action confere de novo). */
function decisoesDisponiveis(artigo: ArtigoEmEdicao): Decisao[] {
  const lista: Decisao[] = [];
  if (artigo.statusPublicacao === "arquivado") return lista;
  if (artigo.versaoAberta?.status === "aguardando_aprovacao")
    lista.push("aprovar", "devolver", "rejeitar");
  if (artigo.statusPublicacao === "publicado") {
    lista.push(
      "despublicar",
      artigo.destaque ? "remover_destaque" : "destacar",
    );
  }
  if (artigo.statusPublicacao === "despublicado") lista.push("republicar");
  lista.push("arquivar");
  return lista;
}

/**
 * Tela de análise. Mostra a **versão em análise** (ou a de trabalho) desenhada
 * como o público a veria, a autoria real, a versão no ar quando é revisão, as
 * decisões e o histórico. Artigo institucional ganha também o formulário.
 */
export function ModeracaoArtigoPage({
  artigo,
  previa,
  categorias,
  nomeGestor,
  cardsHome,
}: {
  artigo: ArtigoEmEdicao;
  previa: ArtigoCompleto;
  categorias: { id: string; nome: string; ativa: boolean }[];
  nomeGestor: string;
  cardsHome: PainelCardsHomeDoArtigo | null;
}) {
  const autor = previa.autor;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={ROTA_GESTAO_CONHECIMENTO}
            className="text-sm font-semibold text-primary hover:underline"
          >
            ← Central de Conhecimento
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {previa.titulo || "(sem título)"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <SituacaoEditorialBadge situacao={artigo.situacao} />
            {artigo.versaoAberta ? (
              <span>versão {artigo.versaoAberta.numero}</span>
            ) : null}
            {artigo.revisaoEmAndamento ? (
              <span>· revisão de artigo publicado</span>
            ) : null}
            {artigo.publicadoEm ? (
              <span>· no ar desde {formatarData(artigo.publicadoEm)}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={caminhoPreviaArtigo(artigo.id)}
            target="_blank"
            className="alvo-toque-h inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:border-primary/50"
          >
            <Eye className="size-4" aria-hidden /> Prévia
          </Link>
          {artigo.statusPublicacao === "publicado" ? (
            <Link
              href={caminhoArtigo(artigo.slug)}
              target="_blank"
              className="alvo-toque-h inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:border-primary/50"
            >
              <ExternalLink className="size-4" aria-hidden /> No site
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          {artigo.tipoAutoria === "institucional" ? (
            <FormularioArtigo
              modo="institucional"
              artigo={artigo}
              categorias={categorias}
              nomeGestor={nomeGestor}
              rotaVoltar={ROTA_GESTAO_CONHECIMENTO}
              prefixoEdicao={`${ROTA_GESTAO_CONHECIMENTO}/artigos`}
              cardsHome={cardsHome}
            />
          ) : (
            <>
              {/* Artigo de profissional (inclusive o do próprio Gestor): a opção
                  vem antes do texto — depois dele ficava a ~9 mil px do topo. */}
              {cardsHome ? <SecaoCardsHome painel={cardsHome} /> : null}
              <article className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                {artigo.revisaoEmAndamento && artigo.versaoPublicada ? (
                  <p className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                    Revisão de um artigo publicado. No ar:{" "}
                    <strong>{artigo.versaoPublicada.titulo}</strong> (versão{" "}
                    {artigo.versaoPublicada.numero}). Ao aprovar, a nova versão
                    substitui a publicada.
                  </p>
                ) : null}
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  {previa.categoria?.nome ?? "Sem categoria"}
                </p>
                <h2 className="mt-2 text-2xl font-bold text-foreground">
                  {previa.titulo}
                </h2>
                <p className="mt-2 text-muted-foreground">{previa.resumo}</p>
                <dl className="mt-4 grid gap-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold">URL:</dt>
                    <dd className="break-all text-muted-foreground">
                      /conhecimento/{previa.slug}{" "}
                      {artigo.slugFixo
                        ? "(fixa)"
                        : "(pode mudar até a publicação)"}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold">Palavras-chave:</dt>
                    <dd className="text-muted-foreground">
                      {previa.palavrasChave.length
                        ? previa.palavrasChave.join(", ")
                        : "nenhuma"}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold">Título SEO:</dt>
                    <dd className="text-muted-foreground">
                      {previa.tituloSeo ?? "automático"}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="font-semibold">Meta descrição:</dt>
                    <dd className="text-muted-foreground">
                      {previa.descricaoSeo ?? "automática (resumo)"}
                    </dd>
                  </div>
                </dl>
                {previa.capaUrl ? (
                  <img
                    src={previa.capaUrl}
                    alt={previa.capaAlt ?? ""}
                    className="my-6 aspect-[16/9] w-full rounded-xl border border-border object-cover"
                  />
                ) : (
                  <p className="my-4 text-xs text-muted-foreground">
                    Sem imagem de capa.
                  </p>
                )}
                <ConteudoArtigo conteudo={previa.conteudo} />
                {previa.fontes.length ? (
                  <div className="mt-8 rounded-xl border border-border p-4">
                    <p className="mb-2 font-semibold">Fontes informadas</p>
                    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                      {previa.fontes.map((fonte, indice) => (
                        <li key={`${indice}-${fonte.titulo}`}>
                          {fonte.titulo}
                          {fonte.url ? (
                            <>
                              {" — "}
                              <a
                                href={fonte.url}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="break-all text-primary underline"
                              >
                                {fonte.url}
                              </a>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-amber-700 dark:text-amber-300">
                    O autor não informou fontes.
                  </p>
                )}
              </article>
            </>
          )}
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Autoria
            </h2>
            {autor.tipo === "profissional" ? (
              <div className="text-sm">
                <p className="font-semibold text-foreground">{autor.nome}</p>
                <p className="text-muted-foreground">
                  {descricaoDoAutor(autor) || "Profissional"}
                </p>
                <Link
                  href={autor.perfilUrl}
                  target="_blank"
                  className="mt-2 inline-block font-semibold text-primary hover:underline"
                >
                  Ver perfil público
                </Link>
              </div>
            ) : autor.tipo === "equipe" ? (
              <div className="text-sm">
                <p className="font-semibold text-foreground">{autor.nome}</p>
                <p className="text-muted-foreground">
                  {autor.funcao} · {autor.identificacao}
                </p>
              </div>
            ) : (
              <p className="text-sm text-foreground">
                Vincis
                {autor.responsavel
                  ? ` — responsável editorial: ${autor.responsavel}`
                  : ""}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Decisão
            </h2>
            <PainelModeracao
              artigoId={artigo.id}
              disponiveis={decisoesDisponiveis(artigo)}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Histórico
            </h2>
            <HistoricoEditorial itens={artigo.historico} />
          </section>
        </aside>
      </div>
    </div>
  );
}
