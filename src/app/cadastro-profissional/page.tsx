import { redirect } from "next/navigation";
import { obterSessaoServidor } from "@/features/usuarios/lib/sessao-servidor";
import { obterMeuPerfilProfissional } from "@/features/usuarios/actions/salvar-perfil-profissional";
import { OnboardingProfissional } from "@/features/usuarios/components/profissional/OnboardingProfissional";
import { CabecalhoCadastroProfissional } from "@/features/usuarios/components/profissional/CabecalhoCadastroProfissional";
import { resolverAcessoUsuario } from "@/features/usuarios/queries/obter-destino-apos-login";

export default async function ProfissionalRoute() {
  const usuario = await obterSessaoServidor();
  if (!usuario) redirect("/?entrar=1");
  const acesso = await resolverAcessoUsuario(usuario.id);
  if (!acesso || acesso.destino !== "/cadastro-profissional")
    redirect(acesso?.destino ?? "/");
  const perfil = await obterMeuPerfilProfissional();
  const dadosIniciais = perfil
    ? {
        tipoProfissional: perfil.tipoProfissional as
          "advocacia" | "contabilidade" | "especialista_fiscal",
        numeroRegistro: perfil.numeroRegistro ?? "",
        areasAtuacao: perfil.areasAtuacao,
        apresentacao: perfil.apresentacao,
        nomeAtuacao: perfil.nomeAtuacao,
        modalidadeAtuacao: perfil.modalidadeAtuacao as
          "individual" | "escritorio",
        cidade: perfil.cidade,
        estado: perfil.estado,
        cep: perfil.cep ?? "",
        logradouro: perfil.logradouro ?? "",
        numero: perfil.numero ?? "",
        complemento: perfil.complemento ?? "",
        bairro: perfil.bairro ?? "",
        tempoExperiencia: perfil.tempoExperiencia ?? 0,
        regimesAtendidos: perfil.regimesAtendidos as (
          "mei" | "simples_nacional" | "lucro_presumido" | "lucro_real"
        )[],
        comprovanteRegistroNomeOriginal: perfil.comprovanteRegistroNomeOriginal,
        telefoneContato: perfil.telefoneContato,
        emailProfissional: perfil.emailProfissional,
        statusAnalise: perfil.statusAnalise,
        observacaoAnalise: perfil.observacaoAnalise,
      }
    : undefined;
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_34%),hsl(var(--background))]">
      <CabecalhoCadastroProfissional nome={usuario.nome} />
      <OnboardingProfissional
        usuarioId={usuario.id}
        nome={usuario.nome}
        email={usuario.email}
        whatsapp={usuario.whatsapp}
        dadosIniciais={dadosIniciais}
      />
    </div>
  );
}
