import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Server externo: pacotes que precisam ficar no servidor */
  serverExternalPackages: ["bcryptjs", "postgres", "drizzle-orm"],

  /* Desabilita strict mode para evitar double-render em componentes legados */
  reactStrictMode: false,

  /*
    Limite do corpo das Server Actions. O padrão do Next é 1 MB, mas os uploads
    de imagem pública (avatar, foto do perfil, capa e imagens de artigos) aceitam
    até 5 MB — validados de novo no servidor (tipo, assinatura e tamanho). 6 MB
    dá folga para o envelope multipart sem abrir a porta para arquivos maiores.
  */
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
  },

  // Headers de seguranca
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },
};

export default nextConfig;
