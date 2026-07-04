"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

// Grupo de opciones tipo "toggle" con píldora que se DESLIZA hasta la opción
// activa (en vez de saltar). Funciona con enlaces (server-rendered) o con
// onClick: React reutiliza el nodo de la píldora y el transform transiciona.
export type OpcionSegmento = {
  etiqueta: React.ReactNode;
  href?: string;
  onClick?: () => void;
  activo: boolean;
};

export function Segmentado({
  opciones,
  tono = "claro",
  className,
}: {
  opciones: OpcionSegmento[];
  tono?: "claro" | "oscuro"; // claro = fondo chip + píldora blanca; oscuro = borde + píldora negra
  className?: string;
}) {
  const activo = Math.max(0, opciones.findIndex((o) => o.activo));
  const ancho = 100 / opciones.length;

  return (
    <div
      className={cn(
        "relative isolate flex",
        tono === "claro" ? "rounded-lg bg-chip p-0.5" : "rounded-xl border border-line bg-card p-1",
        className,
      )}
    >
      {/* La píldora deslizante */}
      <span
        aria-hidden
        className={cn(
          "absolute z-0 transition-[left] duration-300 ease-[cubic-bezier(0.3,0.9,0.3,1)]",
          tono === "claro"
            ? "inset-y-0.5 rounded-md bg-card shadow-sm"
            : "inset-y-1 rounded-lg bg-ink",
        )}
        style={{
          width: `calc(${ancho}% - ${tono === "claro" ? "4px" : "8px"})`,
          left: `calc(${activo * ancho}% + ${tono === "claro" ? "2px" : "4px"})`,
        }}
      />
      {opciones.map((o, i) => {
        const clases = cn(
          "relative z-10 flex-1 cursor-pointer text-center font-semibold whitespace-nowrap transition-colors duration-300 active:scale-[0.97]",
          tono === "claro" ? "rounded-md px-3 py-1 text-[12.5px]" : "rounded-lg px-3.5 py-1.5 text-[13px]",
          o.activo
            ? tono === "claro"
              ? "text-ink"
              : "text-white"
            : "text-ink-soft hover:text-ink",
        );
        return o.href ? (
          <Link key={i} href={o.href} className={clases}>
            {o.etiqueta}
          </Link>
        ) : (
          <button key={i} onClick={o.onClick} className={clases}>
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
