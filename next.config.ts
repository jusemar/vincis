import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Server externo: pacotes que precisam ficar no servidor */
  serverExternalPackages: ["bcryptjs", "postgres", "drizzle-orm"],

  /* Desabilita strict mode para evitar double-render em componentes legados */
  reactStrictMode: false,

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
