import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/sessao-token";

// Rotas que não exigem login.
const PUBLICAS = ["/login"];
// Rotas só de administrador (prefixos).
const APENAS_ADMIN = ["/gestao", "/relatorios", "/configuracoes", "/financeiro", "/estoque/entradas"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const sessao = await verificarSessao(req.cookies.get(NOME_COOKIE_SESSAO)?.value);
  if (!sessao) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (sessao.papel !== "ADMIN" && APENAS_ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/pdv";
    url.search = "?erro=sem-permissao";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Tudo menos arquivos estáticos, assets do Next e o manifest (o celular baixa sem login).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|ico|webp|webmanifest|css|js|map)$).*)"],
};
