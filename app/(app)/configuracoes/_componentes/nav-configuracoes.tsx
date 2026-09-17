"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, DatabaseBackup, Plug, QrCode, ScrollText, Smartphone, Store, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Secao = { href: string; rotulo: string; descricao: string; Icone: typeof Store };

export const SECOES_CONFIGURACOES: Secao[] = [
  { href: "/configuracoes", rotulo: "Loja", descricao: "Nome, CNPJ e cupom", Icone: Store },
  { href: "/configuracoes/usuarios", rotulo: "Usuários", descricao: "Quem acessa e com qual PIN", Icone: Users },
  { href: "/configuracoes/pagamentos", rotulo: "Formas de pagamento", descricao: "Taxas e prazos", Icone: CreditCard },
  { href: "/configuracoes/maquininhas", rotulo: "Maquininhas", descricao: "InfinitePay, Sipag e taxas", Icone: Smartphone },
  { href: "/configuracoes/pix", rotulo: "Pix", descricao: "Chave e QR Code", Icone: QrCode },
  {
    href: "/configuracoes/mercado-pago",
    rotulo: "Integração Mercado Pago (opcional)",
    descricao: "Só pra maquininha Point",
    Icone: Plug,
  },
  { href: "/configuracoes/metas", rotulo: "Metas e regras", descricao: "Metas, descontos, alertas", Icone: Target },
  { href: "/configuracoes/backup", rotulo: "Backup", descricao: "Cópia de segurança dos dados", Icone: DatabaseBackup },
  { href: "/configuracoes/auditoria", rotulo: "Auditoria", descricao: "Quem fez o quê", Icone: ScrollText },
];

export function NavConfiguracoes() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Seções das configurações"
      className="rounded-padrao border border-borda bg-superficie p-2 shadow-padrao"
    >
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {SECOES_CONFIGURACOES.map(({ href, rotulo, descricao, Icone }) => {
          const ativo =
            href === "/configuracoes" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  ativo
                    ? "bg-primaria-suave font-medium text-primaria"
                    : "text-texto-suave hover:bg-superficie-2 hover:text-texto",
                )}
              >
                <Icone className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate">{rotulo}</span>
                  <span className={cn("hidden text-xs lg:block", ativo ? "text-primaria/80" : "text-texto-fraco")}>
                    {descricao}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
