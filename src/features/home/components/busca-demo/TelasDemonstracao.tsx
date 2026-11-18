"use client";

import { Suspense } from "react";
import { Sparkles, Users } from "lucide-react";
import { ChamadaSolicitarOrcamento } from "@/features/oportunidades/components/cliente/ChamadaSolicitarOrcamento";
import PerfilProfissionalV2 from "@/features/perfis/components/PerfilProfissionalV2";
import FilterBar from "@/features/profissionais/components/FilterBar";
import ProfessionalCard from "@/features/profissionais/components/ProfessionalCard";
import type { FilterState, Professional } from "@/features/profissionais/types/profissionais";
import type { PerfilDemonstracao } from "../../queries/demonstracao-busca";
import { ENQUADRAMENTO_MAPA } from "../../constants/rede-territorial";
import { MapaBrasil } from "../rede/MapaBrasil";
import "../../styles/demonstracao-viva.css";
import "../../styles/rede-tema.css";

/**
 * As três telas da demonstração de busca, desenhadas com os componentes REAIS
 * sempre que eles funcionam sem servidor:
 *
 * - Home: topo real da Home (a abertura da Rede Vincis, mesmas classes `viva`
 *   e o mesmo mapa). Só o texto e o mapa; a animação da rede não roda aqui.
 * - Listagem: `FilterBar`, `ProfessionalCard` e `ChamadaSolicitarOrcamento`
 *   reais, com os resultados reais da busca (lidos no servidor). O invólucro
 *   `ProfessionalsPage` NÃO é usado: ele dispara a pesquisa a cada letra
 *   digitada. O título e a contagem abaixo são cópia fiel da marcação dele.
 * - Perfil: `PerfilProfissionalV2` real, com os dados públicos do
 *   profissional clicado — os mesmos que `/perfil-profissional?prestador=`
 *   entrega a um visitante anônimo.
 *
 * Nada aqui é interativo: o palco envolve tudo com `inert`.
 */

const nada = () => undefined;

/** Mesmos filtros iniciais da vitrine real; só a busca muda. */
const FILTROS_DEMONSTRACAO: FilterState = {
  search: "",
  profession: "all",
  specialty: "Todas as Especialidades",
  location: "Todas as Localizações",
  city: "",
  state: "",
  formation: "",
  minExperience: 0,
  modality: "all",
  minRating: 0,
  availability: "all",
  maxPrice: 1000,
};

const VIEWBOX_MAPA = `${ENQUADRAMENTO_MAPA.x} 100 730 487`;

export function TelaHomeDemonstracao({ alturaMinima }: { alturaMinima: number }) {
  // Ocupa a janela inteira, como a abertura da Home ocupa a tela.
  return (
    <section className="viva" style={{ minHeight: alturaMinima }} aria-hidden="true">
      <div className="viva-cabecalho">
        <span>DA SUA NECESSIDADE À SOLUÇÃO</span>
        <p>
          Uma rede de especialistas. <strong>Uma conexão feita para você.</strong>
        </p>
      </div>
      <svg className="mx-auto block w-full max-w-3xl" viewBox={VIEWBOX_MAPA} aria-hidden="true">
        <MapaBrasil />
      </svg>
    </section>
  );
}

export function TelaListagemDemonstracao({
  busca,
  profissionais,
  total,
  selecionadoId,
}: {
  busca: string;
  profissionais: Professional[];
  /** Total real de profissionais públicos para o termo atual. */
  total: number;
  /** Card que o cursor vai clicar. */
  selecionadoId: string | null;
}) {
  return (
    <div className="bg-background">
      {/* Cópia fiel do topo de `ProfessionalsPage` (sem a animação de entrada). */}
      <div className="relative overflow-hidden bg-background pb-12 pt-24">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mb-4 text-4xl font-bold sm:text-5xl lg:text-6xl">
            Encontre seu <span className="text-gradient-gold">Profissional</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Escolha entre contadores, advogados e assistentes contábeis. Compare perfis, serviços e agendas antes
            de escolher.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <ChamadaSolicitarOrcamento />
        <FilterBar filters={{ ...FILTROS_DEMONSTRACAO, search: busca }} onFilterChange={nada} />
        <div className="mb-6 flex items-center justify-between">
          <p className="text-muted-foreground">
            Mostrando <b className="text-foreground">{profissionais.length}</b> de {total} profissionais
          </p>
          {profissionais.some((item) => item.isAvailable) && (
            <p className="flex items-center gap-2 text-sm text-green-500">
              <Sparkles className="size-4" />
              Disponíveis para atendimento
            </p>
          )}
        </div>
        {profissionais.length ? (
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
            {profissionais.map((item) => (
              <div key={item.id} data-demo-alvo={item.id === selecionadoId ? "card-selecionado" : undefined} className="flex">
                <ProfessionalCard professional={item} />
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-muted">
              <Users className="size-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold">Nenhum profissional encontrado</h3>
          </div>
        )}
      </div>
    </div>
  );
}

export function TelaPerfilDemonstracao({ perfil }: { perfil: PerfilDemonstracao }) {
  // `PerfilProfissionalV2` lê `useSearchParams`, que exige limite de Suspense.
  // `podeEditar` é sempre falso e `prestadorId` não é passado: ele só serve
  // para retomar uma contratação guardada na sessão de quem navega, e a
  // demonstração não deve consumir nem abrir nada disso.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <PerfilProfissionalV2 {...perfil} podeEditar={false} />
    </Suspense>
  );
}
