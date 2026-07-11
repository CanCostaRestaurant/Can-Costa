// Protege toda la app detrás del login y aplica los roles (como haddock):
// admin todo; documentos solo Documentos; gestor consulta (sin TPV/reservas/
// clientes/escandallos); chef solo Escandallos y Productos.
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, verificarSesion, type RolUsuario } from "@/lib/auth";

// El login NO cubre los endpoints de sistema: el cron y salud se autentican
// por su cuenta (x-vercel-cron / CRON_SECRET). Si no, el gate de login los
// redirige a /login y el cron nunca llega a ejecutar su handler.
// /reservar = reservas web públicas (los clientes reservan sin login).
// /web = la web pública del restaurante (marketing + carta + reservas).
const RUTAS_PUBLICAS = ["/login", "/api/salud", "/api/cron", "/reservar", "/web"];

function esPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// null = acceso a todo; si no, prefijos permitidos (+ bloquea = excepciones
// dentro de lo permitido) + adónde mandar el resto.
const ACCESO: Record<RolUsuario, { permite: string[]; bloquea?: string[]; inicio: string } | null> = {
  admin: null,
  documentos: { permite: ["/documentos"], inicio: "/documentos" },
  gestor: {
    permite: ["/", "/dashboard", "/ventas", "/caja", "/facturacion", "/documentos", "/banco", "/productos", "/proveedores", "/incidencias", "/conciliacion", "/personal"],
    inicio: "/dashboard",
  },
  chef: { permite: ["/escandallos", "/productos"], inicio: "/escandallos" },
  // Modo tablet: cobrar (TPV), el día (Ventas), cerrar la caja (Caja) y
  // emitir factura a quien la pida (Facturación). Pero NO editar el plano
  // del local (/tpv/mesas): eso es configuración, no para camareros.
  tpv: { permite: ["/tpv", "/ventas", "/caja", "/facturacion"], bloquea: ["/tpv/mesas"], inicio: "/tpv" },
};

const empataPrefijo = (p: string, pathname: string) =>
  p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/");

function puedeVer(rol: RolUsuario, pathname: string): boolean {
  const regla = ACCESO[rol];
  if (!regla) return true;
  if (regla.bloquea?.some((p) => empataPrefijo(p, pathname))) return false;
  return regla.permite.some((p) => empataPrefijo(p, pathname));
}

export async function proxy(req: NextRequest) {
  const secreto = process.env.AUTH_SECRET;
  // Sin AUTH_SECRET configurado la app queda abierta (solo arranque/desarrollo).
  if (!secreto) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const sesion = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value, secreto);

  if (pathname === "/login") {
    return sesion.ok ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (esPublica(pathname)) return NextResponse.next();
  if (!sesion.ok) return NextResponse.redirect(new URL("/login", req.url));

  if (!puedeVer(sesion.rol, pathname)) {
    return NextResponse.redirect(new URL(ACCESO[sesion.rol]!.inicio, req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
