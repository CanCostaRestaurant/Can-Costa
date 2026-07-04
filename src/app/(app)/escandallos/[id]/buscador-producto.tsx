"use client";

// Buscador de productos del catálogo para el escandallo: en vez de un select
// interminable, un campo con búsqueda insensible a acentos que muestra TODOS
// los productos activos y filtra al teclear.
import { useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProductoOpcion = { id: string; nombre: string; precio: string; unidad: string };

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function BuscadorProducto({
  productos,
  valor,
  onElegir,
}: {
  productos: ProductoOpcion[];
  valor: string;
  onElegir: (id: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contRef = useRef<HTMLDivElement>(null);

  const seleccionado = productos.find((p) => p.id === valor) ?? null;

  const filtrados = useMemo(() => {
    const q = norm(texto.trim());
    if (!q) return productos;
    return productos.filter((p) => norm(p.nombre).includes(q));
  }, [texto, productos]);

  // Producto ya elegido: se muestra como "chip" con opción de cambiarlo.
  if (seleccionado) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-brand bg-brand-soft px-3 py-2">
        <span className="truncate text-sm font-semibold">
          {seleccionado.nombre} <span className="font-normal text-ink-soft">· {seleccionado.precio}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            onElegir("");
            setTexto("");
          }}
          className="shrink-0 cursor-pointer rounded-md p-1 text-ink-soft hover:bg-card hover:text-bad"
          aria-label="Cambiar producto"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={contRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 focus-within:border-brand">
        <Search className="size-4 shrink-0 text-ink-soft" />
        <input
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          placeholder="Buscar producto del catálogo…"
          className="w-full bg-transparent py-2 text-sm outline-none"
        />
        {texto && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setTexto("")}
            className="shrink-0 cursor-pointer rounded-md p-1 text-ink-soft hover:text-ink"
            aria-label="Limpiar búsqueda"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {abierto && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-(--shadow-lift)">
          <div className="px-3 py-1 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
            {texto.trim() ? `${filtrados.length} resultado(s)` : `Todos · ${productos.length}`}
          </div>
          {filtrados.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-ink-soft">
              Sin resultados. Usa la línea fija de abajo para un coste suelto.
            </div>
          )}
          {filtrados.map((p) => (
            <button
              key={p.id}
              type="button"
              // onMouseDown para elegir antes de que el blur cierre el panel.
              onMouseDown={(e) => {
                e.preventDefault();
                onElegir(p.id);
                setAbierto(false);
                setTexto("");
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-hover",
              )}
            >
              <span className="truncate font-semibold">{p.nombre}</span>
              <span className="shrink-0 text-[12.5px] text-ink-soft">{p.precio}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
