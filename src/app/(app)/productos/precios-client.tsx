"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Chip } from "@/components/ui";
import { type Producto } from "@/lib/mock";
import { cn, eur } from "@/lib/utils";
import { fijarPrecioPactado } from "./actions";

type Familia = "todos" | "subida" | Producto["familia"];

function normaliza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function esSubida(p: Producto): boolean {
  return p.enAlza ?? p.variacion >= 5;
}

export function PreciosClient({ productos }: { productos: Producto[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [familia, setFamilia] = useState<Familia>("todos");
  const [fProveedor, setFProveedor] = useState("");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(productos[0]?.id ?? null);

  const conSubida = productos.filter(esSubida).length;
  const proveedoresUnicos = useMemo(
    () => [...new Set(productos.map((p) => p.proveedor).filter((p) => p !== "—"))].sort((a, b) => a.localeCompare(b)),
    [productos],
  );

  const FAMILIAS: { id: Familia; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "subida", label: `Con subida · ${conSubida}` },
    { id: "pescado", label: "Pescado" },
    { id: "carne", label: "Carne" },
    { id: "fruta-verdura", label: "Fruta y verdura" },
    { id: "seco", label: "Seco y aceites" },
  ];

  const visibles = useMemo(() => {
    const q = normaliza(busqueda.trim());
    return productos.filter((p) => {
      if (familia === "subida" && !esSubida(p)) return false;
      if (familia !== "todos" && familia !== "subida" && p.familia !== familia) return false;
      if (fProveedor && p.proveedor !== fProveedor) return false;
      if (q && !normaliza(`${p.nombre} ${p.proveedor}`).includes(q)) return false;
      return true;
    });
  }, [productos, busqueda, familia, fProveedor]);

  const seleccionado = productos.find((p) => p.id === seleccionadoId) ?? null;

  return (
    <div className="grid grid-cols-[1.7fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
      <div>
        <div className="card mb-3.5 flex items-center gap-2.5 rounded-xl! px-3.5 py-2.5">
          <Search className="size-[17px] text-ink-soft" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto… (merluza, aceite, tomate)"
            className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-soft/60"
          />
          <select
            value={fProveedor}
            onChange={(e) => setFProveedor(e.target.value)}
            className={cn(
              "max-w-44 rounded-lg border border-line bg-card px-2 py-1.5 text-[13px] outline-none focus:border-brand",
              fProveedor ? "font-semibold" : "text-ink-soft",
            )}
          >
            <option value="">Todos los proveedores</option>
            {proveedoresUnicos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3.5 flex flex-wrap gap-2">
          {FAMILIAS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFamilia(f.id)}
              className={cn(
                "cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all",
                familia === f.id
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-card text-ink-soft hover:border-[#CFC6B4]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Último precio</Th>
                <Th>Variación</Th>
                <Th>Tendencia</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSeleccionadoId(p.id)}
                  className={cn(
                    "cursor-pointer border-b border-line transition-colors last:border-none hover:bg-hover",
                    seleccionadoId === p.id && "bg-hover",
                  )}
                >
                  <td className="px-3.5 py-3 text-sm">
                    <span className="font-semibold">{p.nombre}</span>
                    <span className="mt-px block text-xs text-ink-soft">
                      {p.proveedor} · última compra {p.ultimaCompra}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 font-display text-[14.5px] font-semibold whitespace-nowrap">
                    {p.precio}
                  </td>
                  <td className="px-3.5 py-3">
                    {p.variacion > 0 ? (
                      <Chip tone="bad">▲ +{p.variacion}%</Chip>
                    ) : p.variacion < 0 ? (
                      <Chip tone="good">▼ {p.variacion}%</Chip>
                    ) : (
                      <Chip tone="gray">=</Chip>
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    <Sparkline hist={p.hist} variacion={p.variacion} />
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3.5 py-8 text-center text-sm text-ink-soft">
                    {productos.length === 0
                      ? "Aún no hay productos. Se crearán al validar tus primeras facturas."
                      : "Ningún producto coincide con la búsqueda"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {seleccionado ? (
        <HistPanel key={seleccionado.id} producto={seleccionado} />
      ) : (
        <div className="card p-5.5 text-sm text-ink-soft max-md:hidden">
          Selecciona un producto para ver su histórico de compra.
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}

function colorVariacion(variacion: number): string {
  if (variacion > 0) return "#C23B2A";
  if (variacion < 0) return "#2E7D5B";
  return "#B9B29F";
}

function Sparkline({ hist, variacion }: { hist: number[]; variacion: number }) {
  const min = Math.min(...hist);
  const max = Math.max(...hist);
  const rng = max - min || 1;
  const pts = hist
    .map((v, i) => `${(i / (hist.length - 1 || 1)) * 88 + 1},${24 - ((v - min) / rng) * 20}`)
    .join(" ");
  return (
    <svg viewBox="0 0 90 26" className="h-[26px] w-[90px]">
      <polyline
        points={pts}
        fill="none"
        stroke={colorVariacion(variacion)}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HistPanel({ producto: p }: { producto: Producto }) {
  const router = useRouter();
  const [, startPactado] = useTransition();
  const [textoPactado, setTextoPactado] = useState(
    p.precioPactado !== null && p.precioPactado !== undefined ? String(p.precioPactado) : "",
  );

  const min = Math.min(...p.hist);
  const max = Math.max(...p.hist);
  const rng = max - min || 1;
  const W = 300;
  const H = 130;
  const pad = 10;
  const pts = p.hist.map((v, i) => ({
    x: pad + (i / (p.hist.length - 1 || 1)) * (W - 2 * pad),
    y: H - pad - ((v - min) / rng) * (H - 2 * pad - 14),
  }));
  const linea = pts.map((pt) => `${pt.x},${pt.y}`).join(" ");
  const color = colorVariacion(p.variacion);

  function guardarPactado() {
    const limpio = textoPactado.trim().replace(",", ".");
    const valor = limpio === "" ? null : parseFloat(limpio);
    const previo = p.precioPactado ?? null;
    if (valor === previo || (valor !== null && !Number.isFinite(valor))) return;
    startPactado(async () => {
      await fijarPrecioPactado(p.id, valor);
      router.refresh();
    });
  }

  return (
    <div className="card sticky top-6 p-5.5 max-md:static">
      <div className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Histórico de compra</div>
      <h3 className="mt-2 font-display text-base font-bold tracking-tight">{p.nombre}</h3>
      <div
        className={cn(
          "font-display text-[34px] font-bold tracking-tight",
          p.enAlza === true && "text-bad",
          p.enAlza === false && "text-good",
        )}
      >
        {p.precio.split(" ")[0]} €
        {p.enAlza !== undefined && (
          <span className="ml-1.5 align-middle text-[15px]">{p.enAlza ? "▲" : "▼"}</span>
        )}
      </div>
      <div className="mb-3.5 text-[13px] text-ink-soft">
        {p.proveedor} · última compra {p.ultimaCompra}
      </div>

      {p.nCompras !== undefined && p.nCompras > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-line px-3.5 py-3">
          <Dato etiqueta="Precio de referencia*" valor={p.referencia !== null && p.referencia !== undefined ? eur(p.referencia) : "—"} />
          <Dato etiqueta="Compras" valor={String(p.nCompras)} />
          <Dato etiqueta="Máximo" valor={p.maximo !== null && p.maximo !== undefined ? eur(p.maximo) : "—"} />
          <Dato etiqueta="Mínimo" valor={p.minimo !== null && p.minimo !== undefined ? eur(p.minimo) : "—"} />
          <div className="col-span-2 border-t border-line pt-2.5">
            <div className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
              Precio pactado con el proveedor
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="number"
                step="0.01"
                min="0"
                value={textoPactado}
                onChange={(e) => setTextoPactado(e.target.value)}
                onBlur={guardarPactado}
                placeholder="sin pactar"
                className="w-24 rounded-lg border border-line bg-card px-2 py-1 text-sm outline-none placeholder:text-ink-soft/50 focus:border-brand"
              />
              <span className="text-xs text-ink-soft">€/{p.unidad ?? "ud"} · manda sobre la referencia</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-ink-soft">
              *media ponderada de tus compras. Última compra por encima → rojo; por debajo → verde.
            </p>
          </div>
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[130px] w-full overflow-visible">
        <polygon points={`${pad},${H} ${linea} ${W - pad},${H}`} fill={color} opacity="0.08" />
        <polyline
          points={linea}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === pts.length - 1 ? 5 : 3}
            fill={i === pts.length - 1 ? color : "#fff"}
            stroke={color}
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11.5px] text-ink-soft">
        <span>{p.meses[0]}</span>
        <span>{p.meses[p.meses.length - 1]}</span>
      </div>

      <div
        className="mt-4 rounded-xl bg-brand-soft px-3.5 py-3 text-[13px] leading-relaxed text-[#8C3A22]"
        dangerouslySetInnerHTML={{ __html: p.nota }}
      />
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className="font-display text-[15px] font-bold">{valor}</div>
    </div>
  );
}
