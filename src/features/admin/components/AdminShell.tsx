"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TelaCarregandoEspaco } from "@/components/shared/TelaCarregandoEspaco";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/features/usuarios";
import { ehGestorPlataforma } from "@/features/usuarios/lib/gestor-plataforma";
import { tipoPrestadorDoPerfil } from "@/features/usuarios/lib/tipos-pessoa";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { MobileAdminNavigation } from "./MobileAdminNavigation";

/**
 * Moldura única da área administrativa.
 *
 * Existe porque a Gestão da plataforma deixou de ser uma aplicação à parte: as
 * telas que vinham de `/gestao` passaram a viver dentro de `/admin` e precisam
 * da mesma barra lateral, do mesmo cabeçalho e da mesma navegação mobile que o
 * painel já usava. Em vez de repetir esse desenho, o painel e as telas de
 * Gestão passam pelo mesmo componente — não há uma segunda identidade visual.
 */
export function AdminShell({
  children,
  reputacao,
}: {
  children: React.ReactNode;
  /** Reputação do prestador, quando houver: alimenta o rodapé da barra. */
  reputacao?: { media: number | null; total: number };
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const router = useRouter();
  const { theme } = useTheme();
  const { estaAutenticado, estaCarregando, erroSessao, refreshSession, usuario } =
    useAuth();
  // Quem vê o grupo "Gestão da Plataforma" é decidido pela sessão — a mesma
  // regra que o middleware e as guardas de servidor aplicam —, nunca pela URL
  // aberta. Esconder menu não autoriza nada; o que este valor faz é impedir que
  // a barra ofereça uma porta que o servidor vai fechar.
  const ehGestor = ehGestorPlataforma(usuario);
  /*
    Há operação profissional nesta conta?

    É o que decide se o menu do painel — Clientes, Agenda, Atendimentos — tem
    para onde levar. A pergunta é sobre o que a pessoa **exerce**, nunca sobre
    o cargo: o Gestor que também é Profissional vê o painel inteiro, e uma
    conta sem cadastro de prestador não vê itens que abririam telas vazias.
  */
  const ehPrestador = usuario
    ? tipoPrestadorDoPerfil(usuario.perfilTipo) !== null
    : false;

  useEffect(() => {
    // Sem sessão e sem erro de conferência: a pessoa realmente não está
    // logada. Com erro, ficar é o certo — deslogar alguém por causa de uma
    // resposta que não chegou é perder trabalho por um soluço de rede.
    if (!estaCarregando && !estaAutenticado && !erroSessao) {
      router.replace("/");
    }
  }, [estaAutenticado, estaCarregando, erroSessao, router]);

  /*
    Toda saída daqui é uma tela, nunca `null`.

    Devolver nada deixava a página em branco com o fundo do tema — e quem
    olhava não conseguia distinguir "está chegando" de "quebrou". São três
    situações distintas e cada uma diz o que é: a sessão sendo lida, a
    conferência que não pôde ser feita (com botão de tentar de novo) e o
    intervalo curto até o redirecionamento de quem não está logado.
  */
  if (estaCarregando) {
    return <TelaCarregandoEspaco mensagem="Carregando sua conta..." />;
  }

  if (erroSessao && !estaAutenticado) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="px-6">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldAlert className="size-5" />
            </div>
            <h1 className="mt-5 font-serif text-2xl font-semibold">
              Não foi possível confirmar sua sessão
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A conexão com o servidor falhou. Sua sessão continua guardada —
              tente novamente em instantes.
            </p>
            <Button className="mt-6 w-full" onClick={() => void refreshSession()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!estaAutenticado) {
    return <TelaCarregandoEspaco mensagem="Redirecionando..." />;
  }

  return (
    <div
      className="admin-dashboard flex h-dvh bg-background overflow-hidden"
      data-theme={theme}
    >
      <div className="hidden lg:contents">
        <AdminSidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed((recolhida) => !recolhida)}
          nomeUsuario={usuario?.nome ?? "Profissional"}
          reputacao={reputacao}
          ehGestor={ehGestor}
          ehPrestador={ehPrestador}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader ocultarPerfil={!ehPrestador} />

        <main className="flex-1 overflow-y-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
          {children}
        </main>
      </div>
      <MobileAdminNavigation ehGestor={ehGestor} ehPrestador={ehPrestador} />
    </div>
  );
}

export default AdminShell;
