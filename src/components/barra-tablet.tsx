"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, FileText, LogOut, Tablet, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { cerrarSesion } from "@/app/login/actions";

// Barra superior del MODO TABLET (rol tpv): solo lo que hace falta en sala —
// cobrar (TPV), el día (Ventas), la caja/cierre (Caja), las facturas emitidas
// (Facturas: se generan desde el recibo y se consultan/reimprimen aquí) y salir.
// Sin sidebar.
export function BarraTablet({ nombre }: { nombre: string }) {
  const pathname = usePathname();

  const enlaces = [
    { href: "/tpv", etiqueta: "TPV", icono: Tablet },
    { href: "/ventas", etiqueta: "Ventas", icono: Coins },
    { href: "/caja", etiqueta: "Caja", icono: Wallet },
    { href: "/facturacion", etiqueta: "Facturas", icono: FileText },
  ];

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-line bg-paper/90 px-4 py-2 backdrop-blur-sm print:hidden">
      <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand font-display text-[15px] font-extrabold text-white">
        C
      </div>

      <nav className="ml-2 flex gap-1.5">
        {enlaces.map(({ href, etiqueta, icono: Icono }) => {
          const activo = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl px-4 text-[14.5px] font-semibold transition-all active:scale-[0.97]",
                activo ? "bg-ink text-white" : "text-ink-soft hover:bg-chip hover:text-ink",
              )}
            >
              <Icono className="size-4.5" /> {etiqueta}
            </Link>
          );
        })}
      </nav>

      <span className="ml-auto text-[13px] font-semibold text-ink-soft">{nombre}</span>
      <button
        onClick={() => cerrarSesion()}
        title="Cerrar sesión"
        className="grid size-10 cursor-pointer place-items-center rounded-xl text-ink-soft transition-colors hover:bg-chip hover:text-ink"
      >
        <LogOut className="size-4.5" />
      </button>
    </header>
  );
}
