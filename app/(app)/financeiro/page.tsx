import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** /financeiro não tem tela própria: manda pra despesas. */
export default function PaginaFinanceiro() {
  redirect("/financeiro/despesas");
}
