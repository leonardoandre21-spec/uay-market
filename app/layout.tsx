import type { Metadata, Viewport } from "next";
import "./globals.css";

// Fonte do sistema (Segoe UI no Windows): o build não pode depender de baixar
// fonte do Google, porque o PC do mercado pode estar sem internet ou com o
// domínio bloqueado. A pilha fica em --font-sans no globals.css.

export const metadata: Metadata = {
  title: { default: "Uay Market", template: "%s · Uay Market" },
  description: "Sistema de gestão do Uay Market: caixa, estoque, financeiro e relatórios.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f7a4d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
