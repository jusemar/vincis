import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  MapPin,
  Star,
  Briefcase,
  ChevronDown,
  X,
} from "lucide-react";
import { ESPECIALIDADES_POR_CATEGORIA } from "../constants/taxonomia-profissional";
import type { FilterState } from "../types/profissionais";

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  variant?: "public" | "adminEquipe";
}

const professions = [
  { value: "all", label: "Todas as Profissões" },
  { value: "contador", label: "Contadores" },
  { value: "advogado", label: "Advogados" },
  { value: "tecnico", label: "Técnicos" },
];

/**
 * Mesmas especialidades de sempre, agora lidas da taxonomia compartilhada.
 *
 * As chaves aqui são as da interface de busca (`contador`, `advogado`,
 * `tecnico`); as da taxonomia são as categorias reais do cadastro. O de-para
 * fica nesta linha e em nenhum outro lugar.
 */
const specialties = {
  all: ["Todas as Especialidades"],
  contador: [
    "Todas as Especialidades",
    ...ESPECIALIDADES_POR_CATEGORIA.contabilidade,
  ],
  advogado: [
    "Todas as Especialidades",
    ...ESPECIALIDADES_POR_CATEGORIA.advocacia,
  ],
  tecnico: [
    "Todas as Especialidades",
    ...ESPECIALIDADES_POR_CATEGORIA.especialista_fiscal,
  ],
};

const locations = [
  "Todas as Localizações",
  "São Paulo, SP",
  "Rio de Janeiro, RJ",
  "Belo Horizonte, MG",
  "Curitiba, PR",
  "Porto Alegre, RS",
  "Brasília, DF",
  "Salvador, BA",
  "Fortaleza, CE",
  "Remoto",
];

export default function FilterBar({
  filters,
  onFilterChange,
  variant = "public",
}: FilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const handleChange = (
    key: keyof FilterState,
    value: FilterState[keyof FilterState],
  ) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFilterChange({
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
    });
  };

  const activeFiltersCount = [
    filters.profession !== "all",
    filters.specialty !== "Todas as Especialidades",
    filters.location !== "Todas as Localizações",
    variant === "adminEquipe" && Boolean(filters.city),
    variant === "adminEquipe" && Boolean(filters.state),
    variant === "adminEquipe" && Boolean(filters.formation),
    variant === "adminEquipe" && filters.minExperience > 0,
    variant === "adminEquipe" && filters.modality !== "all",
    filters.minRating > 0,
    filters.availability !== "all",
    filters.maxPrice < 1000,
  ].filter(Boolean).length;

  return (
    <div className="w-full">
      {/* Main Search Bar */}
      <div className="glass-card rounded-2xl p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome ou especialidade..."
              value={filters.search}
              onChange={(e) => handleChange("search", e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex gap-2 flex-wrap lg:flex-nowrap">
            <select
              value={filters.profession}
              onChange={(e) => {
                onFilterChange({
                  ...filters,
                  profession: e.target.value,
                  specialty: "Todas as Especialidades",
                });
              }}
              className="px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer min-w-[160px]"
            >
              {professions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>

            <select
              value={filters.location}
              onChange={(e) => handleChange("location", e.target.value)}
              className="px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer min-w-[160px]"
            >
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>

            {/* Mobile Filter Toggle */}
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="lg:hidden px-4 py-3 rounded-xl bg-muted border border-border text-foreground flex items-center gap-2"
            >
              <Filter className="w-5 h-5" />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Desktop Advanced Filter Toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="hidden lg:flex px-4 py-3 rounded-xl bg-muted border border-border text-foreground items-center gap-2 hover:bg-muted/80 transition-colors"
            >
              <Filter className="w-5 h-5" />
              Filtros Avançados
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Clear Filters */}
            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="px-4 py-3 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Expanded Filters - Desktop */}
        <motion.div
          initial={false}
          animate={{
            height: isExpanded ? "auto" : 0,
            opacity: isExpanded ? 1 : 0,
          }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="pt-4 mt-4 border-t border-border">
            <div
              className={
                variant === "adminEquipe"
                  ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
                  : "grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4"
              }
            >
              {/* Specialty */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Especialidade
                </label>
                <select
                  value={filters.specialty}
                  onChange={(e) => handleChange("specialty", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                >
                  {specialties[
                    filters.profession as keyof typeof specialties
                  ]?.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
              </div>

              {variant === "adminEquipe" && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Formação
                  </label>
                  <input
                    value={filters.formation}
                    onChange={(event) =>
                      handleChange("formation", event.target.value)
                    }
                    placeholder="Curso ou instituição"
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground transition-all placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              {variant === "adminEquipe" && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Cidade
                  </label>
                  <input
                    value={filters.city}
                    onChange={(event) =>
                      handleChange("city", event.target.value)
                    }
                    placeholder="Informe a cidade"
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground transition-all placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              {variant === "adminEquipe" && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Estado
                  </label>
                  <input
                    value={filters.state}
                    maxLength={2}
                    onChange={(event) =>
                      handleChange("state", event.target.value.toUpperCase())
                    }
                    placeholder="UF"
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 uppercase text-foreground transition-all placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}

              {variant === "adminEquipe" && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Experiência mínima
                  </label>
                  <select
                    value={filters.minExperience}
                    onChange={(event) =>
                      handleChange("minExperience", Number(event.target.value))
                    }
                    className="w-full cursor-pointer rounded-xl border border-border bg-muted px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {Array.from({ length: 101 }, (_, anos) => (
                      <option key={anos} value={anos}>
                        {anos === 0
                          ? "Qualquer experiência"
                          : `${anos} ${anos === 1 ? "ano" : "anos"} ou mais`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {variant === "adminEquipe" && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Forma de atuação
                  </label>
                  <select
                    value={filters.modality}
                    onChange={(event) =>
                      handleChange("modality", event.target.value)
                    }
                    className="w-full cursor-pointer rounded-xl border border-border bg-muted px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="all">Todas</option>
                    <option value="individual">Individual</option>
                    <option value="escritorio">Escritório</option>
                  </select>
                </div>
              )}

              {/* Rating */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Avaliação Mínima
                </label>
                <select
                  value={filters.minRating}
                  onChange={(e) =>
                    handleChange("minRating", Number(e.target.value))
                  }
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                >
                  <option value={0}>Qualquer avaliação</option>
                  <option value={4}>4+ estrelas</option>
                  <option value={4.5}>4.5+ estrelas</option>
                  <option value={5}>5 estrelas</option>
                </select>
              </div>

              {/* Availability */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Disponibilidade
                </label>
                <select
                  value={filters.availability}
                  onChange={(e) => handleChange("availability", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all cursor-pointer"
                >
                  <option value="all">Todos</option>
                  <option value="available">Disponíveis</option>
                  <option value="unavailable">Indisponíveis</option>
                </select>
              </div>

              {/* Max Price */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Preço Máximo: R$ {filters.maxPrice}/h
                </label>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="50"
                  value={filters.maxPrice}
                  onChange={(e) =>
                    handleChange("maxPrice", Number(e.target.value))
                  }
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>R$ 50</span>
                  <span>R$ 1000</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Mobile Filters Modal */}
      {showMobileFilters && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="lg:hidden glass-card rounded-2xl p-4 mb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Filtros Avançados</h3>
            <button
              onClick={() => setShowMobileFilters(false)}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Especialidade
              </label>
              <select
                value={filters.specialty}
                onChange={(e) => handleChange("specialty", e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground"
              >
                {specialties[
                  filters.profession as keyof typeof specialties
                ]?.map((spec) => (
                  <option key={spec} value={spec}>
                    {spec}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Avaliação Mínima
              </label>
              <select
                value={filters.minRating}
                onChange={(e) =>
                  handleChange("minRating", Number(e.target.value))
                }
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground"
              >
                <option value={0}>Qualquer avaliação</option>
                <option value={4}>4+ estrelas</option>
                <option value={4.5}>4.5+ estrelas</option>
                <option value={5}>5 estrelas</option>
              </select>
            </div>

            {variant === "adminEquipe" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Formação
                </label>
                <input
                  value={filters.formation}
                  onChange={(event) =>
                    handleChange("formation", event.target.value)
                  }
                  placeholder="Curso ou instituição"
                  className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground"
                />
              </div>
            )}

            {variant === "adminEquipe" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Cidade
                </label>
                <input
                  value={filters.city}
                  onChange={(event) => handleChange("city", event.target.value)}
                  placeholder="Informe a cidade"
                  className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground"
                />
              </div>
            )}

            {variant === "adminEquipe" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Estado
                </label>
                <input
                  value={filters.state}
                  maxLength={2}
                  onChange={(event) =>
                    handleChange("state", event.target.value.toUpperCase())
                  }
                  placeholder="UF"
                  className="w-full rounded-xl border border-border bg-muted px-4 py-3 uppercase text-foreground"
                />
              </div>
            )}

            {variant === "adminEquipe" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Experiência mínima
                </label>
                <select
                  value={filters.minExperience}
                  onChange={(event) =>
                    handleChange("minExperience", Number(event.target.value))
                  }
                  className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground"
                >
                  {Array.from({ length: 101 }, (_, anos) => (
                    <option key={anos} value={anos}>
                      {anos === 0
                        ? "Qualquer experiência"
                        : `${anos} ${anos === 1 ? "ano" : "anos"} ou mais`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {variant === "adminEquipe" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-muted-foreground">
                  Forma de atuação
                </label>
                <select
                  value={filters.modality}
                  onChange={(event) =>
                    handleChange("modality", event.target.value)
                  }
                  className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground"
                >
                  <option value="all">Todas</option>
                  <option value="individual">Individual</option>
                  <option value="escritorio">Escritório</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Disponibilidade
              </label>
              <select
                value={filters.availability}
                onChange={(e) => handleChange("availability", e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground"
              >
                <option value="all">Todos</option>
                <option value="available">Disponíveis</option>
                <option value="unavailable">Indisponíveis</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Preço Máximo: R$ {filters.maxPrice}/h
              </label>
              <input
                type="range"
                min="50"
                max="1000"
                step="50"
                value={filters.maxPrice}
                onChange={(e) =>
                  handleChange("maxPrice", Number(e.target.value))
                }
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Active Filters Tags */}
      {activeFiltersCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-2 mb-4"
        >
          {filters.profession !== "all" && (
            <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm flex items-center gap-2 border border-primary/20">
              {professions.find((p) => p.value === filters.profession)?.label}
              <button
                onClick={() => handleChange("profession", "all")}
                className="hover:text-primary/70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.specialty !== "Todas as Especialidades" && (
            <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm flex items-center gap-2 border border-primary/20">
              {filters.specialty}
              <button
                onClick={() =>
                  handleChange("specialty", "Todas as Especialidades")
                }
                className="hover:text-primary/70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.location !== "Todas as Localizações" && (
            <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm flex items-center gap-2 border border-primary/20">
              {filters.location}
              <button
                onClick={() =>
                  handleChange("location", "Todas as Localizações")
                }
                className="hover:text-primary/70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {variant === "adminEquipe" && filters.city && (
            <span className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-primary">
              {filters.city}
              <button
                onClick={() => handleChange("city", "")}
                className="hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {variant === "adminEquipe" && filters.state && (
            <span className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-primary">
              {filters.state}
              <button
                onClick={() => handleChange("state", "")}
                className="hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {variant === "adminEquipe" && filters.formation && (
            <span className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-primary">
              Formação: {filters.formation}
              <button
                onClick={() => handleChange("formation", "")}
                className="hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {variant === "adminEquipe" && filters.minExperience > 0 && (
            <span className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-primary">
              {filters.minExperience}+ anos
              <button
                onClick={() => handleChange("minExperience", 0)}
                className="hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {variant === "adminEquipe" && filters.modality !== "all" && (
            <span className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-primary">
              {filters.modality === "individual" ? "Individual" : "Escritório"}
              <button
                onClick={() => handleChange("modality", "all")}
                className="hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.minRating > 0 && (
            <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm flex items-center gap-2 border border-primary/20">
              {filters.minRating}+ estrelas
              <button
                onClick={() => handleChange("minRating", 0)}
                className="hover:text-primary/70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.availability !== "all" && (
            <span className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm flex items-center gap-2 border border-primary/20">
              {filters.availability === "available"
                ? "Disponíveis"
                : "Indisponíveis"}
              <button
                onClick={() => handleChange("availability", "all")}
                className="hover:text-primary/70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </motion.div>
      )}
    </div>
  );
}
