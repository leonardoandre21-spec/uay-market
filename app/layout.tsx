import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

// Poppins (títulos, valores em destaque) acompanha o traço itálico e pesado da logo;
// Inter (texto, tabelas, números) garante leitura no caixa. O build roda no Vercel,
// que baixa as fontes do Google uma vez e serve tudo do próprio domínio.
const fonteMarca = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--fonte-marca",
  display: "swap",
});
const fonteTexto = Inter({ subsets: ["latin"], variable: "--fonte-texto", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Uay Market", template: "%s · Uay Market" },
  description: "Sistema de gestão do Uay Market: caixa, estoque, financeiro e relatórios.",
  applicationName: "Uay Market",
  appleWebApp: { capable: true, title: "Uay Market", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1e37",
};

// O ToastProvider fica aqui, acima dos grupos de rota (login, app, pdv): um aviso
// disparado logo antes de trocar de grupo (ex.: "Caixa aberto" e ir pro PDV)
// sobrevive à navegação em vez de sumir junto com o layout que o criou.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${fonteMarca.variable} ${fonteTexto.variable}`}>
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
