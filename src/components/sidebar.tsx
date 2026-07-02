"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, ChefHat, Home, ReceiptText, Tag, Truck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/facturas", label: "Facturas", icon: ReceiptText },
  { href: "/precios", label: "Precios", icon: Tag },
  { href: "/escandallos", label: "Escandallos", icon: ChefHat },
];

const PRONTO = [
  { label: "Pedidos", icon: Truck },
  { label: "Equipo", icon: Users },
  { label: "Ventas TPV", icon: ChartColumn },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[216px] shrink-0 flex-col gap-1 border-r border-line px-3.5 py-5 max-md:w-16">
      <div className="flex items-center gap-2.5 px-2.5 pb-6">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-brand font-display text-[17px] font-extrabold text-white">
          C
        </div>
        <div className="font-display text-base font-bold tracking-tight max-md:hidden">
          Can Costa
          <small className="block font-body text-[11px] font-medium text-ink-soft">food cost &amp; compras</small>
        </div>
      </div>

      {NAV.map(({ href, label, icon: Icon }) => {
        const activo = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium transition-colors",
              activo ? "bg-ink text-white" : "text-ink-soft hover:bg-chip hover:text-ink",
            )}
          >
            <Icon className="size-[19px] shrink-0" />
            <span className="max-md:hidden">{label}</span>
          </Link>
        );
      })}

      <div className="mx-2.5 my-3.5 h-px bg-line" />

      {PRONTO.map(({ label, icon: Icon }) => (
        <div
          key={label}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-medium text-ink-soft opacity-45"
        >
          <Icon className="size-[19px] shrink-0" />
          <span className="max-md:hidden">{label}</span>
          <span className="ml-auto rounded-full bg-chip px-1.5 py-0.5 text-[10px] font-semibold max-md:hidden">
            pronto
          </span>
        </div>
      ))}

      <div className="mt-auto flex items-center gap-2.5 px-2.5 py-2.5">
        <div className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-bold text-white">J</div>
        <span className="text-[13px] font-semibold max-md:hidden">
          Joaquim
          <small className="block text-[11.5px] font-normal text-ink-soft">Propietario</small>
        </span>
      </div>
    </aside>
  );
}
