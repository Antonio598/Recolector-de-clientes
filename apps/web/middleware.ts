import { NextResponse, type NextRequest } from "next/server";

// El middleware corre en Edge (sin acceso a Postgres): solo revisa que exista la cookie.
// La sesión se valida contra la base en el servidor (requireUser / requireRole).
const SESSION_COOKIE = "gv_session";
const PUBLIC_PREFIXES = ["/login", "/u/", "/api/unsubscribe/", "/api/webhooks/", "/api/health"];

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
