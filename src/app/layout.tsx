import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { AppChrome } from "@/components/shared/AppChrome";
import { listarMenuCabecalhoPublico } from "@/features/cms/queries/publico";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vincis - Plataforma contábil e advogados",
  description:
    "Plataforma SaaS de Contabilidade e Advocacia. Conectamos clientes a profissionais contábeis e jurídicos.",
  keywords: [
    "contabilidade",
    "advocacia",
    "saas",
    "profissionais",
    "serviços contábeis",
    "serviços jurídicos",
  ],
};

/**
 * `viewportFit: "cover"` é o que habilita `env(safe-area-inset-*)` no navegador
 * móvel. Sem ele os insets valem sempre 0 e qualquer ação colada na base fica
 * atrás da barra de gestos do iOS/Android. `maximumScale`/`userScalable` ficam
 * de fora de propósito: bloquear zoom é uma barreira de acessibilidade.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O menu do cabeçalho vem do CMS. `AppChrome` e `NavigationNext` são
  // componentes de cliente e não consultam banco: a leitura acontece aqui, no
  // servidor, em cache etiquetado (`cms-navegacao`), e não lança — na falha,
  // ficam os links fixos. O rodapé é fixo no código (`features/institucional`),
  // igual em todos os ambientes.
  const navegacaoCabecalho = await listarMenuCabecalhoPublico();

  // `data-scroll-behavior="smooth"` declara ao Next que a rolagem suave do
  // `globals.css` é intencional. Sem o atributo o roteador avisa a cada
  // navegação e desliga a suavização durante as transições de rota.
  return (
    <html
      lang="pt-BR"
      className="relative"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers>
          <AppChrome navegacaoCabecalho={navegacaoCabecalho}>
            {children}
          </AppChrome>
        </Providers>
      </body>
    </html>
  );
}
