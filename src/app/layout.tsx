import type { Metadata } from "next";
import { Providers } from "./providers";
import { AppChrome } from "@/components/shared/AppChrome";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="relative" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <AppChrome>{children}</AppChrome>
        </Providers>
      </body>
    </html>
  );
}
