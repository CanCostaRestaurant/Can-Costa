// Protege toda la app detrás del login. Sin sesión → /login.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, verificarToken } from "@/lib/auth";

const RUTAS_PUBLICAS = ["/login", "/api/salud"];

function esPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(req: NextRequest) {
  const secreto = process.env.AUTH_SECRET;
  // Sin AUTH_SECRET configurado la app queda abierta (solo arranque/desarrollo).
  if (!secreto) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const sesionOk = await verificarToken(req.cookies.get(COOKIE_SESION)?.value, secreto);

  if (pathname === "/login") {
    return sesionOk ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (esPublica(pathname)) return NextResponse.next();
  if (!sesionOk) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
