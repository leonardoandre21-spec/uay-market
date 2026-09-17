import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só o próprio PC do mercado acessa; sem cabeçalho de propaganda.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Importação de produtos por CSV envia o arquivo inteiro pela action.
      bodySizeLimit: "4mb",
    },
  },
  webpack: (config, { webpack, nextRuntime }) => {
    // O bundle Edge (middleware) não aceita imports com esquema "node:" em módulos
    // que acabam compilados pra ele. Tirar o prefixo resolve: no Node vira o builtin
    // normal; no Edge o módulo nunca é executado. Mantido por segurança mesmo sem o
    // instrumentation.ts (removido junto com o backup em disco).
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
    );
    if (nextRuntime === "edge") {
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        fs: false,
        "fs/promises": false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
