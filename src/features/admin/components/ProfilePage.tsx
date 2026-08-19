"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { obterMeuPerfilProfissional } from "@/features/usuarios/actions/salvar-perfil-profissional";
import { obterMeuPerfilColaborador } from "@/features/usuarios/actions/salvar-perfil-colaborador";
import { OnboardingColaborador } from "@/features/usuarios/components/colaborador/OnboardingColaborador";
import { ProfessionalProfileContent } from "./ProfessionalProfileContent";
import { useAuth } from "@/features/usuarios";

type DadosPerfil = NonNullable<
  Awaited<ReturnType<typeof obterMeuPerfilProfissional>>
>;
type DadosColaborador = NonNullable<
  Awaited<ReturnType<typeof obterMeuPerfilColaborador>>
>;

/**
 * "Meu Perfil" atende os dois tipos de prestador com o mesmo design.
 *
 * Cada action já valida o tipo da pessoa no servidor e devolve `null` quando
 * não é o caso, então basta usar o resultado que veio preenchido.
 */
export default function ProfilePage() {
  const { usuario } = useAuth();
  const [perfil, setPerfil] = useState<DadosPerfil | null>(null);
  const [colaborador, setColaborador] = useState<DadosColaborador | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([
      obterMeuPerfilProfissional(),
      obterMeuPerfilColaborador(),
    ]).then(([dadosProfissional, dadosColaborador]) => {
      setPerfil(dadosProfissional);
      setColaborador(dadosColaborador);
      setCarregando(false);
    });
  }, []);

  if (carregando) {
    return (
      <div className="flex min-h-80 items-center justify-center">
        <LoaderCircle className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  if (colaborador) {
    return (
      <OnboardingColaborador
        modo="perfil"
        nome={usuario?.nome ?? "Colaborador"}
        email={usuario?.email ?? colaborador.emailProfissional}
        whatsapp={usuario?.whatsapp}
        dadosIniciais={{
          nomeAtuacao: colaborador.nomeAtuacao,
          areasAtuacao: colaborador.areasAtuacao,
          apresentacao: colaborador.apresentacao,
          cidade: colaborador.cidade,
          estado: colaborador.estado,
          cep: colaborador.cep ?? "",
          logradouro: colaborador.logradouro ?? "",
          numero: colaborador.numero ?? "",
          complemento: colaborador.complemento ?? "",
          bairro: colaborador.bairro ?? "",
          tempoExperiencia: colaborador.tempoExperiencia ?? 0,
          formacao: colaborador.formacao ?? "",
          instituicaoEnsino: colaborador.instituicaoEnsino ?? "",
          especialidades: colaborador.especialidades,
          certificacoes: colaborador.certificacoes,
          valorHora: colaborador.valorHora,
          disponivelAtendimento: colaborador.disponivelAtendimento,
          regimesAtendidos: colaborador.regimesAtendidos as (
            | "mei"
            | "simples_nacional"
            | "lucro_presumido"
            | "lucro_real"
          )[],
          telefoneContato: colaborador.telefoneContato,
          emailProfissional: colaborador.emailProfissional,
        }}
      />
    );
  }

  if (!perfil)
    return (
      <p className="text-sm text-muted-foreground">
        Perfil não encontrado.
      </p>
    );

  return (
    <ProfessionalProfileContent
      perfil={perfil}
      nome={usuario?.nome ?? "Profissional"}
      email={usuario?.email ?? perfil.emailProfissional}
      whatsapp={usuario?.whatsapp}
    />
  );
}
