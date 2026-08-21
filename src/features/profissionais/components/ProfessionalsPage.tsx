"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Users } from "lucide-react";
import Footer from "@/components/shared/Footer";
import { ChamadaSolicitarOrcamento } from "@/features/oportunidades/components/cliente/ChamadaSolicitarOrcamento";
import { pesquisarProfissionaisPublicos } from "../actions/pesquisar-profissionais";
import type { FilterState, Professional } from "../types/profissionais";
import FilterBar from "./FilterBar";
import ProfessionalCard from "./ProfessionalCard";

const FILTROS_INICIAIS: FilterState = {
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

export default function ProfessionalsPage() {
  const [filters, setFilters] = useState(FILTROS_INICIAIS);
  const filtrosAdiados = useDeferredValue(filters);
  const [profissionais, setProfissionais] = useState<Professional[]>([]);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    startTransition(async () => {
      setCarregando(true);
      const [cidadeLocalizacao, estadoLocalizacao] =
        filtrosAdiados.location === "Todas as Localizações" ||
        filtrosAdiados.location === "Remoto"
          ? ["", ""]
          : filtrosAdiados.location.split(",").map((item) => item.trim());
      const resultado = await pesquisarProfissionaisPublicos({
        busca: filtrosAdiados.search,
        profissao:
          filtrosAdiados.profession === "all"
            ? "todos"
            : filtrosAdiados.profession === "contador"
              ? "contabilidade"
              : filtrosAdiados.profession === "advogado"
                ? "advocacia"
                : "especialista_fiscal",
        especialidade:
          filtrosAdiados.specialty === "Todas as Especialidades"
            ? ""
            : filtrosAdiados.specialty,
        formacao: filtrosAdiados.formation,
        experienciaMinima: filtrosAdiados.minExperience,
        modalidade:
          filtrosAdiados.modality === "all" ? "todos" : filtrosAdiados.modality,
        cidade: filtrosAdiados.city || cidadeLocalizacao,
        estado: filtrosAdiados.state || estadoLocalizacao,
        pagina,
        porPagina: 9,
      });
      if (!ativo) return;
      if (!resultado.sucesso || !resultado.dados) {
        setProfissionais([]);
        setCarregando(false);
        return;
      }
      setProfissionais(
        resultado.dados.profissionais
          .map((item) => ({
            id: item.id,
            name: item.nome,
            photo: item.avatarUrl ?? null,
            profession: (item.profissao === "advocacia"
              ? "advogado"
              : item.profissao === "contabilidade"
                ? "contador"
                : "tecnico") as Professional["profession"],
            specialty:
              item.especialidades[0] ??
              item.areasAtuacao[0] ??
              "Atendimento profissional",
            location: `${item.cidade}, ${item.estado}`,
            rating: (item.avaliacaoMedia ?? 0) / 10,
            reviewCount: item.totalAvaliacoes,
            education:
              [item.formacao, item.instituicaoEnsino]
                .filter(Boolean)
                .join(" - ") || "Formação não informada",
            experience: `${item.experiencia ?? 0} anos`,
            hourlyRate: (item.valorHoraCentavos ?? 0) / 100,
            isAvailable: item.disponivel,
            specialties: item.especialidades,
            about: item.apresentacao,
            certifications: item.certificacoes,
          }))
          .filter(
            (item) =>
              item.rating >= filtrosAdiados.minRating &&
              item.hourlyRate <= filtrosAdiados.maxPrice &&
              (filtrosAdiados.availability === "all" ||
                item.isAvailable ===
                  (filtrosAdiados.availability === "available")),
          ),
      );
      setTotal(resultado.dados.total);
      setTotalPaginas(resultado.dados.totalPaginas);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [filtrosAdiados, pagina]);

  return (
    <div className="min-h-dvh bg-background">
      <div className="relative overflow-hidden bg-background pt-24 pb-12">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1 className="mb-4 text-4xl font-bold sm:text-5xl lg:text-6xl">
              Encontre seu{" "}
              <span className="text-gradient-gold">Profissional</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Escolha entre contadores, advogados e técnicos especializados.
              Todos verificados e prontos para ajudar seu negócio.
            </p>
          </motion.div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        {/* Etapa anterior à escolha: quem ainda não sabe a quem recorrer
            descreve a necessidade e recebe propostas. A vitrine abaixo
            permanece exatamente como estava. */}
        <ChamadaSolicitarOrcamento />
        <FilterBar
          filters={filters}
          onFilterChange={(valor) => {
            setFilters(valor);
            setPagina(1);
          }}
        />
        <div className="mb-6 flex items-center justify-between">
          <p className="text-muted-foreground">
            {carregando ? (
              "Carregando profissionais..."
            ) : (
              <>
                Mostrando{" "}
                <b className="text-foreground">{profissionais.length}</b> de{" "}
                {total} profissionais
              </>
            )}
          </p>
          {profissionais.some((item) => item.isAvailable) && (
            <p className="flex items-center gap-2 text-sm text-green-500">
              <Sparkles className="size-4" />
              Disponíveis para atendimento
            </p>
          )}
        </div>
        {!carregando && profissionais.length ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {profissionais.map((item) => (
              <ProfessionalCard key={item.id} professional={item} />
            ))}
          </div>
        ) : (
          !carregando && (
            <div className="py-20 text-center">
              <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-muted">
                <Users className="size-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold">
                Nenhum profissional encontrado
              </h3>
              <p className="mt-2 text-muted-foreground">
                Ajuste os filtros para encontrar outro profissional.
              </p>
            </div>
          )
        )}
        {totalPaginas > 1 && (
          <div className="mt-8 flex justify-center gap-3">
            <button
              className="rounded-lg border px-4 py-2 disabled:opacity-50"
              disabled={pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </button>
            <span className="py-2 text-sm">
              Página {pagina} de {totalPaginas}
            </span>
            <button
              className="rounded-lg border px-4 py-2 disabled:opacity-50"
              disabled={pagina === totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
