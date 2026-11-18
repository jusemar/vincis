"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, GraduationCap, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_PERFIL } from "@/features/perfil-pro/constants/perfil-pro";
import { tituloDoEscritorio } from "@/features/empresas/lib/titulo-escritorio";
import { identificacaoProfissional } from "../lib/identificacao-profissional";
import { SeloModeloContratacao } from "./SeloModeloContratacao";
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

/** Subtítulo genérico usado quando o cadastro não tem especialidade nem área. */
const SUBTITULO_GENERICO = "Atendimento profissional";

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
  // Preço no azul-marinho do botão, só no dark e só na vitrine pública.
  const precoDark = variant === "adminEquipe" ? undefined : "dark:!text-secondary";
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
    location,
    responsavel,
  } = professional;

  // Identificação a partir do cadastro estruturado (nunca do texto livre).
  const identificacao = identificacaoProfissional(
    professional.tipoProfissional,
    Boolean(professional.ehEscritorio),
    variant === "adminEquipe" ? "equipe" : "publico",
  );
  // Escritório: "Escritório | Nome" (sem repetir quando o nome já começa assim).
  const titulo = professional.ehEscritorio ? tituloDoEscritorio(name) : null;
  // Subtítulo só quando acrescenta algo: a especialidade já aparece nas
  // etiquetas abaixo, e o texto genérico não informa nada.
  const subtitulo =
    specialty && specialty !== SUBTITULO_GENERICO && !specialties.includes(specialty)
      ? specialty
      : null;
  const credencial =
    variant === "adminEquipe"
      ? certifications[0] || "Credenciado"
      : /*
          Na vitrine, o canto do cabeçalho é só a credencial comprovada
          ("Credenciado" = CRC/OAB conferido, mesma regra do perfil). Cursos e
          certificações informados pelo prestador não disputam espaço com a
          identificação da profissão: ficam completos no perfil.
        */
        professional.registroVerificado
        ? "Credenciado"
        : null;

  return (
    /*
      `self-start`: no grid da listagem os itens esticavam até a altura do card
      mais alto da linha (`align-items: stretch`), e o fundo do card aparecia
      como faixa vazia abaixo do rodapé. Cada card agora tem a altura do próprio
      conteúdo, alinhado pelo topo, onde quer que seja usado.
    */
    <article className="group glass-card flex flex-col self-start overflow-hidden rounded-2xl transition-all duration-500 hover:-translate-y-1 hover:shadow-glow">
      {/*
        Topo só com o que existe: credencial comprovada ("Credenciado") ou o
        status da pesquisa de equipe. Sem nenhum dos dois, nada é desenhado — a
        profissão fica no cabeçalho, abaixo do nome, como texto.
      */}
      {credencial || (variant === "adminEquipe" && statusLabel) ? (
        <div className="flex items-center justify-end gap-2 px-5 pt-4">
          {variant === "adminEquipe" && statusLabel ? (
            <span className="rounded-full bg-background/70 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-foreground">
              {statusLabel}
            </span>
          ) : null}
          {credencial ? (
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {credencial}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Foto + nome lado a lado; o restante ocupa a largura toda abaixo. */}
      <div className="flex items-center gap-4 px-5 pt-4">
        <div className="relative shrink-0">
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
          <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-full shadow-card ring-2 ring-border transition-transform duration-500 group-hover:scale-105 sm:h-24 sm:w-24">
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

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold leading-tight tracking-tight text-foreground [overflow-wrap:anywhere]">
            {titulo?.rotulo ? (
              <>
                <span className="font-semibold text-muted-foreground">{titulo.rotulo}</span>
                <span aria-hidden className="mx-1.5 font-normal text-muted-foreground/60">
                  |
                </span>
                {titulo.nome.toUpperCase()}
              </>
            ) : (
              (titulo?.nome ?? name).toUpperCase()
            )}
          </h2>
          {/* Profissão (individual) ou área (escritório): do cadastro, texto simples. */}
          {identificacao ? (
            <p className="mt-0.5 text-sm font-normal text-muted-foreground">{identificacao.rotulo}</p>
          ) : null}
          {subtitulo ? <p className="mt-0.5 text-xs font-medium text-primary">{subtitulo}</p> : null}
          {responsavel ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Responsável técnico:{" "}
              <span className="font-semibold text-foreground">{responsavel}</span>
            </p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1">
            {/* Sem avaliações ainda não é nota zero: exibir "0,0" afirmaria uma
                reputação péssima que ninguém deu. */}
            <span className="text-sm font-extrabold text-foreground">
              {reviewCount > 0 ? rating.toFixed(1).replace(".", ",") : "—"}
            </span>
            <Star aria-hidden className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-[11px] text-muted-foreground">
              ({reviewCount} {reviewCount === 1 ? "avaliação" : "avaliações"})
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 pb-4 pt-4">
        {/* Dados em duas colunas a partir de telas médias — sem coluna estreita. */}
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground sm:grid-cols-2">
          {location && !location.startsWith(",") ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Localização</dt>
              <MapPin aria-hidden className="h-3 w-3 shrink-0" />
              <dd className="font-semibold text-foreground">{location}</dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Experiência</dt>
            <Briefcase aria-hidden className="h-3 w-3 shrink-0" />
            <dd>
              <span className="font-semibold text-foreground">{experience}</span> de experiência
            </dd>
          </div>
          {/* Formação resumida (uma linha); os detalhes ficam no perfil. */}
          <div className="flex min-w-0 items-center gap-1.5 sm:col-span-2">
            <dt className="sr-only">Formação</dt>
            <GraduationCap aria-hidden className="h-3 w-3 shrink-0" />
            <dd className="truncate font-medium text-foreground" title={education}>
              {education}
            </dd>
          </div>
        </dl>

        {specialties.length ? (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Especialidades
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {specialties.slice(0, 4).map((item) => (
                <li
                  key={item}
                  className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                >
                  {item}
                </li>
              ))}
              {specialties.length > 4 ? (
                <li className="px-1 py-0.5 text-[11px] text-muted-foreground">
                  +{specialties.length - 4}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {/* Advocacia: Perfil Essencial/Pro. Diz como os documentos circulam,
            não é selo de qualidade nem muda a posição na busca. */}
        {variant !== "adminEquipe" && professional.perfilAdvocacia ? (
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">
              {ROTULO_PERFIL[professional.perfilAdvocacia].nome}
            </span>{" "}
            · {ROTULO_PERFIL[professional.perfilAdvocacia].card}
          </p>
        ) : null}

        {/* Contabilidade: como se contrata este profissional. */}
        {variant !== "adminEquipe" && professional.modeloContratacao ? (
          <SeloModeloContratacao modelo={professional.modeloContratacao} />
        ) : null}
      </div>

      {/*
        Rodapé: encerra o card (o card não estica mais, então não sobra faixa
        abaixo dele). No dark, e só aqui, o rodapé vira dourado fosco liso
        (#D3A122) com `dark:bg-none`; o preço usa o azul-marinho do botão com
        `!` porque a regra global `.bg-gradient-gold *` força a cor.
      */}
      <footer
        className={
          variant === "adminEquipe"
            ? "flex flex-col gap-3 bg-gradient-gold px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
            : "flex items-center justify-between gap-3 bg-gradient-gold px-5 py-3 dark:bg-[#D3A122] dark:bg-none"
        }
      >
        {/* Advocacia (individual ou escritório): nunca preço público. */}
        {variant !== "adminEquipe" &&
        (professional.profession === "advogado" || professional.tipoProfissional === "advocacia") ? (
          <span className={cn("text-sm font-bold", precoDark)}>Consultar honorários</span>
        ) : variant !== "adminEquipe" && hourlyRate <= 0 ? (
          /* Sem valor/hora cadastrado, "R$ 0 / hora" seria um preço falso. */
          <span className={cn("text-sm font-bold", precoDark)}>Ver serviços e valores</span>
        ) : (
          <div>
            <span className={cn("text-base font-bold", precoDark)}>
              R$ {hourlyRate.toFixed(0)}
            </span>
            <span className={cn("ml-1 text-[11px] opacity-90", precoDark)}>/ hora</span>
          </div>
        )}
        {variant === "adminEquipe" ? (
          adminControls
        ) : (
          <button
            type="button"
            disabled={!professional.isAvailable}
            className="alvo-toque-h inline-flex items-center justify-center rounded-lg border border-transparent bg-white px-4 py-2 text-xs font-bold tracking-wide !text-navy-900 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-900 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm dark:border-white/15 dark:bg-secondary dark:!text-white dark:hover:border-white/35 dark:focus-visible:ring-foreground dark:active:bg-card"
            onClick={(e) => {
              e.stopPropagation();
              if (!professional.isAvailable) return;
              router.push(`/perfil-profissional?prestador=${professional.id}`);
            }}
          >
            {professional.isAvailable ? "VER PERFIL" : "INDISPONÍVEL NO MOMENTO"}
          </button>
        )}
      </footer>
    </article>
  );
};

export default ProfessionalCard;
