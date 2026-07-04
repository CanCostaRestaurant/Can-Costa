"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Apple,
  BookUser,
  CalendarDays,
  ChartColumn,
  ChefHat,
  Coins,
  Home,
  LogOut,
  ReceiptText,
  Scale,
  Settings,
  Tablet,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type RolUsuario } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/actions";

type Item = { href: string; label: string; icon: LucideIcon; chip?: "nuevo" | "pronto" };

const ETIQUETA_ROL: Record<RolUsuario, string> = {
  admin: "Administrador",
  documentos: "Documentos",
  gestor: "Gestor",
  chef: "Chef",
  tpv: "Tablet TPV",
};

// Qué ve cada rol en el menú (el proxy además bloquea la ruta).
function visiblePara(rol: RolUsuario, href: string): boolean {
  if (rol === "admin") return true;
  if (rol === "documentos") return href === "/documentos";
  if (rol === "chef") return href === "/escandallos" || href === "/productos";
  if (rol === "tpv") return href === "/tpv" || href === "/ventas" || href === "/caja"; // (usa BarraTablet, esto es red de seguridad)
  // gestor: consulta de negocio y gastos, sin TPV/reservas/clientes
  return !["/tpv", "/reservas", "/clientes"].includes(href);
}

const GRUPOS: { titulo: string; items: Item[] }[] = [
  // Grupos calcados de Haddock: Negocio, Gastos, Compras (mismo contenido).
  {
    titulo: "Negocio",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/dashboard", label: "Dashboard", icon: ChartColumn },
      { href: "/escandallos", label: "Escandallos", icon: ChefHat },
    ],
  },
  // Extras de Can Costa que no existen en Haddock, en su propio apartado.
  {
    titulo: "Gestión",
    items: [
      { href: "/tpv", label: "TPV", icon: Tablet },
      { href: "/ventas", label: "Ventas", icon: Coins },
      { href: "/caja", label: "Caja", icon: Wallet },
      { href: "/reservas", label: "Reservas", icon: CalendarDays },
      { href: "/clientes", label: "Clientes", icon: BookUser, chip: "nuevo" },
    ],
  },
  {
    titulo: "Gastos",
    items: [
      { href: "/documentos", label: "Documentos", icon: ReceiptText },
      { href: "/conciliacion", label: "Conciliación", icon: Scale, chip: "nuevo" },
      { href: "/personal", label: "Personal", icon: Users, chip: "nuevo" },
    ],
  },
  {
    titulo: "Compras",
    items: [
      { href: "/productos", label: "Productos", icon: Apple },
      { href: "/proveedores", label: "Proveedores", icon: Truck },
      { href: "/incidencias", label: "Incidencias", icon: TriangleAlert },
    ],
  },
];

export function Sidebar({ nombre, rol }: { nombre: string; rol: RolUsuario }) {
  const pathname = usePathname();
  const grupos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => visiblePara(rol, i.href)) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <aside className="sticky top-0 flex h-screen w-[216px] shrink-0 flex-col overflow-y-auto border-r border-line px-3.5 py-5 max-md:w-16 print:hidden">
      <div className="flex items-center gap-2.5 px-2.5 pb-4">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-brand font-display text-[17px] font-extrabold text-white">
          C
        </div>
        <div className="font-display text-base font-bold tracking-tight max-md:hidden">
          Can Costa
          <small className="block font-body text-[11px] font-medium text-ink-soft">food cost &amp; compras</small>
        </div>
      </div>

      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="mt-3">
          <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-soft uppercase max-md:hidden">
            {grupo.titulo}
          </div>
          <div className="flex flex-col gap-0.5">
            {grupo.items.map(({ href, label, icon: Icon, chip }) => {
              const activo =
                href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(href) ||
                    // Facturación (Emitidas) es ahora una pestaña de Documentos.
                    (href === "/documentos" && pathname.startsWith("/facturacion"));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors",
                    activo ? "bg-ink text-white" : "text-ink-soft hover:bg-chip hover:text-ink",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="max-md:hidden">{label}</span>
                  {chip && (
                    <span
                      className={cn(
                        "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold max-md:hidden",
                        chip === "nuevo"
                          ? activo
                            ? "bg-white/20 text-white"
                            : "bg-brand text-white"
                          : activo
                            ? "bg-white/20 text-white"
                            : "bg-chip text-ink-soft",
                      )}
                    >
                      {chip}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-auto flex items-center gap-2 px-2.5 pt-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold text-white uppercase">
          {nombre.slice(0, 1)}
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold max-md:hidden">
          {nombre}
          <small className="block text-[11.5px] font-normal text-ink-soft">{ETIQUETA_ROL[rol]}</small>
        </span>
        {rol === "admin" && (
          <Link
            href="/preferencias"
            title="Preferencias y usuarios"
            className={cn(
              "rounded-lg p-1.5 transition-colors max-md:hidden",
              pathname.startsWith("/preferencias")
                ? "bg-ink text-white"
                : "text-ink-soft hover:bg-chip hover:text-ink",
            )}
          >
            <Settings className="size-4" />
          </Link>
        )}
        <button
          onClick={() => cerrarSesion()}
          title="Cerrar sesión"
          className="cursor-pointer rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-chip hover:text-ink max-md:hidden"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}
