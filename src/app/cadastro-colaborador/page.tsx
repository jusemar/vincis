import { redirect } from "next/navigation";
import { obterSessaoServidor } from "@/features/usuarios/lib/sessao-servidor";
import { obterMeuPerfilColaborador } from "@/features/usuarios/actions/salvar-perfil-colaborador";
import { OnboardingColaborador } from "@/features/usuarios/components/colaborador/OnboardingColaborador";
import { CabecalhoCadastroProfissional } from "@/features/usuarios/components/profissional/CabecalhoCadastroProfissional";
import { resolverAcessoUsuario } from "@/features/usuarios/queries/obter-destino-apos-login";

export default async function CadastroColaboradorRoute() {
  const usuario = await obterSessaoServidor();
  if (!usuario) redirect("/?entrar=1");
  // A mesma resolução central usada pelo middleware e pelo /admin.
  const acesso = await resolverAcessoUsuario(usuario.id);
  if (!acesso || acesso.destino !== "/cadastro-colaborador")
    redirect(acesso?.destino ?? "/");

  const perfil = await obterMeuPerfilColaborador();
  const dadosIniciais = perfil
    ? {
        nomeAtuacao: perfil.nomeAtuacao,
        areasAtuacao: perfil.areasAtuacao,
        apresentacao: perfil.apresentacao,
        cidade: perfil.cidade,
        estado: perfil.estado,
        cep: perfil.cep ?? "",
        logradouro: perfil.logradouro ?? "",
        numero: perfil.numero ?? "",
        complemento: perfil.complemento ?? "",
        bairro: perfil.bairro ?? "",
        tempoExperiencia: perfil.tempoExperiencia ?? 0,
        formacao: perfil.formacao ?? "",
        instituicaoEnsino: perfil.instituicaoEnsino ?? "",
        especialidades: perfil.especialidades,
        certificacoes: perfil.certificacoes,
        valorHora: perfil.valorHora,
        disponivelAtendimento: perfil.disponivelAtendimento,
        regimesAtendidos: perfil.regimesAtendidos as (
          | "mei"
          | "simples_nacional"
          | "lucro_presumido"
          | "lucro_real"
        )[],
        telefoneContato: perfil.telefoneContato,
        emailProfissional: perfil.emailProfissional,
      }
    : undefined;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_34%),hsl(var(--background))]">
      <CabecalhoCadastroProfissional
        nome={usuario.nome}
        subtitulo="Cadastro de colaborador"
      />
      <OnboardingColaborador
        nome={usuario.nome}
        email={usuario.email}
        whatsapp={usuario.whatsapp}
        dadosIniciais={dadosIniciais}
      />
    </div>
  );
}
