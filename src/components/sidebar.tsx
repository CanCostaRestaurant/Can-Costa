"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Apple,
  ChartColumn,
  ChefHat,
  Coins,
  Home,
  ReceiptText,
  Scale,
  TriangleAlert,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; chip?: "nuevo" | "pronto" };

const GRUPOS: { titulo: string; items: Item[] }[] = [
  {
    titulo: "Negocio",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/dashboard", label: "Dashboard", icon: ChartColumn },
      { href: "/ventas", label: "Ventas", icon: Coins, chip: "nuevo" },
      { href: "/escandallos", label: "Escandallos", icon: ChefHat },
    ],
  },
  {
    titulo: "Gastos",
    items: [
      { href: "/documentos", label: "Documentos", icon: ReceiptText },
      { href: "/conciliacion", label: "Conciliación", icon: Scale, chip: "pronto" },
      { href: "/personal", label: "Personal", icon: Users, chip: "pronto" },
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[216px] shrink-0 flex-col overflow-y-auto border-r border-line px-3.5 py-5 max-md:w-16">
      <div className="flex items-center gap-2.5 px-2.5 pb-4">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-brand font-display text-[17px] font-extrabold text-white">
          C
        </div>
        <div className="font-display text-base font-bold tracking-tight max-md:hidden">
          Can Costa
          <small className="block font-body text-[11px] font-medium text-ink-soft">food cost &amp; compras</small>
        </div>
      </div>

      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo} className="mt-3">
          <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-soft uppercase max-md:hidden">
            {grupo.titulo}
          </div>
          <div className="flex flex-col gap-0.5">
            {grupo.items.map(({ href, label, icon: Icon, chip }) => {
              const activo = href === "/" ? pathname === "/" : pathname.startsWith(href);
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

      <div className="mt-auto flex items-center gap-2.5 px-2.5 pt-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold text-white">
          J
        </div>
        <span className="text-[13px] font-semibold max-md:hidden">
          Joaquim
          <small className="block text-[11.5px] font-normal text-ink-soft">Propietario</small>
        </span>
      </div>
    </aside>
  );
}
