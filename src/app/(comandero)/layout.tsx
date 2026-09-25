import Link from "next/link";
import { cookies } from "next/headers";
import { LogOut, Monitor } from "lucide-react";
import { COOKIE_SESION, verificarSesion, type RolUsuario } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/actions";

// COMANDERO: app de móvil a pantalla completa. Sin sidebar ni Fina (en un
// teléfono se comían el ancho y tapaban la barra de "Enviar a cocina") y sin
// la barra de la tablet — solo una franja mínima que se va al hacer scroll.
export default async function ComanderoLayout({ children }: { children: React.ReactNode }) {
  const secreto = process.env.AUTH_SECRET;
  let nombre = "Propietario";
  let rol: RolUsuario = "admin";
  if (secreto) {
    const almacen = await cookies();
    const sesion = await verificarSesion(almacen.get(COOKIE_SESION)?.value, secreto);
    if (sesion.ok) {
      nombre = sesion.nombre;
      rol = sesion.rol;
    }
  }
  // Volver: la tablet de sala al TPV; el resto al CRM.
  const volver = rol === "tpv" ? { href: "/tpv", etiqueta: "TPV" } : { href: "/", etiqueta: "CRM" };

  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-lg items-center gap-2 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-1 print:hidden">
        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand font-display text-[13px] font-extrabold text-white">
          C
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-soft">{nombre}</span>
        <Link
          href={volver.href}
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-ink-soft active:bg-chip"
        >
          <Monitor className="size-4" /> {volver.etiqueta}
        </Link>
        <form action={cerrarSesion}>
          <button
            title="Cerrar sesión"
            className="grid size-9 cursor-pointer place-items-center rounded-lg text-ink-soft active:bg-chip"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </header>
      <main className="px-3.5 pt-2 pb-6">{children}</main>
    </div>
  );
}
