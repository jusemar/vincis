"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Circle, Briefcase, GraduationCap, Star } from "lucide-react";
import type { Professional } from "../types/profissionais";

/** Iniciais para o avatar de quem ainda não enviou foto. */
function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

interface ProfessionalCardProps {
  professional: Professional;
  variant?: "public" | "adminEquipe";
  statusLabel?: string;
  adminControls?: ReactNode;
}

const ProfessionalCard = ({
  professional,
  variant = "public",
  statusLabel,
  adminControls,
}: ProfessionalCardProps) => {
  const router = useRouter();
  const [fotoFalhou, setFotoFalhou] = useState(false);

  const {
    name,
    photo,
    specialty,
    rating,
    reviewCount,
    education,
    experience,
    hourlyRate,
    specialties,
    certifications,
  } = professional;

  return (
    <article className="group glass-card rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:shadow-glow">
      {/* Brand bar */}
      <header className="flex items-center justify-between gap-2 px-5 pt-4">
        <div className="flex items-center gap-2">
          <Circle
            className="h-3.5 w-3.5"
            style={{
              fill: "hsl(var(--primary))",
              stroke: "hsl(var(--primary))",
            }}
            strokeWidth={3}
          />
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-foreground">
            Expert Advisor Hub
          </span>
        </div>
        {variant === "adminEquipe" ? (
          <div className="flex items-center gap-2">
            {statusLabel && (
              <span className="rounded-full bg-background/70 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-foreground">
                {statusLabel}
              </span>
            )}
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {certifications[0] || "Credenciado"}
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {certifications[0] || "Credenciado"}
          </span>
        )}
      </header>

      <div className="flex px-5 pt-4 pb-4">
        {/* Left: avatar */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-70"
              style={{ background: "var(--gradient-gold)" }}
              aria-hidden
            />
            {/*
              Sem foto não existe `<img>`: `src=""` faz o navegador reemitir a
              requisição da própria página e polui o console. O recuo é o mesmo
              das demais telas — iniciais sobre o gradiente da marca.
            */}
            <div className="relative grid h-28 w-28 place-items-center overflow-hidden rounded-full ring-2 ring-border transition-transform duration-500 group-hover:scale-105 shadow-card">
              {photo && !fotoFalhou ? (
                <img
                  src={photo}
                  alt={name}
                  width={256}
                  height={256}
                  onError={() => setFotoFalhou(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-full w-full place-items-center bg-gradient-gold text-2xl font-bold text-on-gradient"
                >
                  {iniciais(name)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Sem avaliações ainda não é nota zero: exibir "0,0" afirmaria uma
                reputação péssima que ninguém deu. O traço mantém o mesmo espaço
                e a mesma tipografia, sem inventar número. */}
            <span className="text-sm font-extrabold text-foreground">
              {reviewCount > 0 ? rating.toFixed(1).replace(".", ",") : "—"}
            </span>
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-[10px] text-muted-foreground">
              ({reviewCount})
            </span>
          </div>
        </div>

        {/* Right: content */}
        <div className="flex-1 min-w-0 ml-6">
          <h1 className="text-lg font-extrabold leading-tight tracking-tight text-foreground">
            {name.toUpperCase()}
          </h1>
          <p className="text-xs font-medium text-primary">{specialty}</p>

          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Briefcase className="h-3 w-3" />
            <span>
              <span className="font-semibold text-foreground">
                {experience}
              </span>{" "}
              de experiência
            </span>
          </div>

          {/* Formação */}
          <div className="mt-2 flex items-start gap-1.5">
            <GraduationCap className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <div className="text-[11px] leading-snug text-foreground">
              <span className="font-medium">{education}</span>
            </div>
          </div>

          {/* Especialidades */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Especialidades:
            </span>
            {specialties.slice(0, 3).map((item) => (
              <span
                key={item}
                className="rounded-md px-1.5 py-0.5 text-[11px] font-medium bg-primary/10 text-primary"
              >
                {item}
              </span>
            ))}
            {specialties.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{specialties.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <footer
        className={
          variant === "adminEquipe"
            ? "flex flex-col gap-3 bg-gradient-gold px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
            : "flex items-center justify-between gap-3 bg-gradient-gold px-5 py-3"
        }
      >
        <div>
          <span className="text-base font-bold">
            R$ {hourlyRate.toFixed(0)}
          </span>
          <span className="ml-1 text-[11px] opacity-90">/ hora</span>
        </div>
        {variant === "adminEquipe" ? (
          adminControls
        ) : (
          <button
            type="button"
            disabled={!professional.isAvailable}
            className="alvo-toque-h inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-xs font-bold tracking-wide text-navy-900 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            onClick={(e) => {
              e.stopPropagation();
              if (!professional.isAvailable) return;
              // Mesmo botão de sempre; agora leva ao perfil daquele prestador.
              router.push(`/perfil-profissional?prestador=${professional.id}`);
            }}
          >
            {professional.isAvailable
              ? "VER PERFIL"
              : "INDISPONÍVEL NO MOMENTO"}
          </button>
        )}
      </footer>
    </article>
  );
};

export default ProfessionalCard;
