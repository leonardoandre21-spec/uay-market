import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ erro?: string }> };

export default async function Inicio({ searchParams }: Props) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  // exigirAdmin() manda o operador pra "/?erro=sem-permissao"; o aviso segue junto até o PDV.
  const { erro } = await searchParams;
  const sufixo = erro === "sem-permissao" ? "?erro=sem-permissao" : "";
  redirect(sessao.papel === "ADMIN" ? "/gestao" : `/pdv${sufixo}`);
}
