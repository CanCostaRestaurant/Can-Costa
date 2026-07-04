"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

// Selector de sección de Documentos: facturas/albaranes RECIBIDAS de proveedores
// vs facturas EMITIDAS a clientes (el facturador). Solo aparece cuando el rol
// puede ver ambas; si solo tiene acceso a una, no hay nada que conmutar.
export function SeccionesDocumentos({
  activa,
  mostrarRecibidas = true,
  mostrarEmitidas = true,
  mostrarBanco = false,
}: {
  activa: "recibidas" | "emitidas" | "banco";
  mostrarRecibidas?: boolean;
  mostrarEmitidas?: boolean;
  mostrarBanco?: boolean;
}) {
  const tabs = [
    mostrarRecibidas && { id: "recibidas", label: "Recibidas", href: "/documentos" },
    mostrarEmitidas && { id: "emitidas", label: "Emitidas", href: "/facturacion" },
    mostrarBanco && { id: "banco", label: "Banco", href: "/banco" },
  ].filter(Boolean) as { id: string; label: string; href: string }[];
  // Solo tiene sentido el conmutador si el rol puede ver al menos dos secciones.
  if (tabs.length < 2) return null;
  return (
    <div className="mb-4 flex w-fit gap-1 rounded-xl bg-chip p-1">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={cn(
            "rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-all active:scale-[0.97]",
            activa === t.id ? "bg-card text-ink shadow-sm" : "text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
