import type { MetadataRoute } from "next";

// Permite "Adicionar à tela inicial" no celular e no Chrome: abre como aplicativo,
// com o azul-marinho da marca na barra do sistema.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Uay Market",
    short_name: "Uay Market",
    description: "Caixa, estoque, financeiro e relatórios do Uay Market.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4f0",
    theme_color: "#0b1e37",
    lang: "pt-BR",
    icons: [
      { src: "/marca/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/marca/icone-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
