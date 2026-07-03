"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHead } from "@/components/ui";
import { CATEGORIAS_CON_PRODUCTOS, ETIQUETA_CATEGORIA, type CategoriaGasto } from "@/lib/mock";
import { type ProveedorResumen } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { configurarProveedor } from "./actions";

export function ProveedoresClient({ proveedores }: { proveedores: ProveedorResumen[] }) {
  const router = useRouter();
  const [, startGuardar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardar(id: string, datos: Parameters<typeof configurarProveedor>[1]) {
    setError(null);
    startGuardar(async () => {
      const res = await configurarProveedor(id, datos);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Proveedores"
        subtitulo="A quién compras y cuánto · solo las categorías de compra alimentan Productos"
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Proveedor</Th>
              <Th>Categoría</Th>
              <Th>Productos desde</Th>
              <Th>Docs</Th>
              <Th>Gasto acumulado</Th>
              <Th>Última compra</Th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => {
              const alimentaProductos = CATEGORIAS_CON_PRODUCTOS.includes(p.categoria);
              return (
                <tr key={p.id} className="border-b border-line transition-colors last:border-none hover:bg-hover">
                  <td className="px-3.5 py-3 text-sm">
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="mt-px block text-xs text-ink-soft">
                      {p.email ?? p.telefono ?? "sin datos de contacto"}
                    </span>
                  </td>
                  <td className="px-3.5 py-3">
                    <select
                      value={p.categoria}
                      onChange={(e) => guardar(p.id, { categoria: e.target.value as CategoriaGasto })}
                      className={cn(
                        "rounded-lg border border-line bg-card px-2 py-1.5 text-[13px] font-semibold outline-none focus:border-brand",
                        !alimentaProductos && "text-ink-soft",
                      )}
                    >
                      {Object.entries(ETIQUETA_CATEGORIA).map(([v, e]) => (
                        <option key={v} value={v}>
                          {e}
                        </option>
                      ))}
                    </select>
                    {!alimentaProductos && (
                      <span className="mt-1 block text-[11px] text-ink-soft">no sale en Productos</span>
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    {alimentaProductos ? (
                      <div className="flex w-fit rounded-lg bg-chip p-0.5">
                        {(["albaranes", "facturas"] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => p.fuenteProductos !== f && guardar(p.id, { fuenteProductos: f })}
                            className={cn(
                              "cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-semibold capitalize transition-colors",
                              p.fuenteProductos === f ? "bg-card shadow-sm" : "text-ink-soft hover:text-ink",
                            )}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="px-3.5 py-3 text-sm">{p.numFacturas}</td>
                  <td className="px-3.5 py-3 font-display text-[14.5px] font-semibold">{eur(p.gastoTotal)}</td>
                  <td className="px-3.5 py-3 text-sm text-ink-soft">{p.ultimaCompra}</td>
                </tr>
              );
            })}
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3.5 py-8 text-center text-sm text-ink-soft">
                  Los proveedores se crean solos al validar tus primeras facturas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}
