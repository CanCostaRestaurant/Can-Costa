"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Chip } from "@/components/ui";
import { type PlatoDetalle } from "@/lib/db/queries";
import { cn, eur, pct } from "@/lib/utils";
import { FotoPlato } from "./foto-plato";
import {
  actualizarIngrediente,
  actualizarPlato,
  agregarIngrediente,
  eliminarIngrediente,
  eliminarPlato,
} from "../actions";

type ProductoOpcion = { id: string; nombre: string; precio: string; unidad: string };

const OBJETIVO = 33;

export function EscandalloEditor({ plato, productos }: { plato: PlatoDetalle; productos: ProductoOpcion[] }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Campos editables (persisten al salir del campo)
  const [nombre, setNombre] = useState(plato.nombre);
  const [emoji, setEmoji] = useState(plato.emoji);
  const [pvpTexto, setPvpTexto] = useState(plato.pvp !== null ? String(plato.pvp) : "");
  const [mermaTexto, setMermaTexto] = useState(String(plato.mermaPct));

  // Alta de ingrediente
  const [nuevoProductoId, setNuevoProductoId] = useState("");
  const [nuevaCantidad, setNuevaCantidad] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevoImporte, setNuevoImporte] = useState("");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  // Food cost en vivo mientras se teclea el PVP
  const pvpActual = parseFloat(pvpTexto.replace(",", ".")) || null;
  const foodCost = pvpActual && pvpActual > 0 ? (plato.coste / pvpActual) * 100 : null;
  const colorFc =
    foodCost === null
      ? "var(--color-chip)"
      : foodCost <= OBJETIVO
        ? "var(--color-good)"
        : foodCost <= 38
          ? "var(--color-warn)"
          : "var(--color-bad)";

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
        <div className="flex items-center gap-3.5">
          <FotoPlato
            platoId={plato.id}
            fotoUrl={plato.fotoUrl}
            emoji={emoji}
            onEmojiChange={setEmoji}
            onEmojiBlur={() => emoji !== plato.emoji && ejecutar(() => actualizarPlato(plato.id, { emoji }))}
          />
          <div>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => nombre !== plato.nombre && ejecutar(() => actualizarPlato(plato.id, { nombre }))}
              className="w-full min-w-[320px] border-b-2 border-transparent bg-transparent font-display text-[27px] font-bold tracking-tight outline-none transition-colors hover:border-line focus:border-brand"
              aria-label="Nombre del plato"
            />
            <p className="mt-0.5 text-sm text-ink-soft">El coste se actualiza solo con cada factura que validas</p>
          </div>
        </div>
        <button
          onClick={() => {
            if (!confirmarBorrado) {
              setConfirmarBorrado(true);
              setTimeout(() => setConfirmarBorrado(false), 4000);
              return;
            }
            ejecutar(async () => {
              const res = await eliminarPlato(plato.id);
              if (res.ok) router.push("/escandallos");
              return res;
            });
          }}
          className={cn(
            "cursor-pointer rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors",
            confirmarBorrado
              ? "border-bad bg-bad text-white"
              : "border-line text-ink-soft hover:border-bad hover:text-bad",
          )}
        >
          {confirmarBorrado ? "¿Seguro? Eliminar plato" : "Eliminar plato"}
        </button>
      </div>

      {plato.aviso && (
        <div className="mb-3.5 flex items-center gap-3 rounded-[14px] border border-[#EED9AC] bg-warn-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#7A5106]">
          <TriangleAlert className="size-5 shrink-0 text-warn" />
          <div>
            {plato.aviso.replace("▲ subió", "Ha subido")} — el coste de este plato ya refleja el precio nuevo.
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[1.6fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        <div className="card overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Ingrediente</Th>
                <Th>Cantidad</Th>
                <Th>Precio actual</Th>
                <Th>Coste</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {plato.ingredientes.map((ing) => (
                <tr key={ing.id} className={cn("border-b border-line", ing.variacion >= 5 && "bg-warn-soft")}>
                  <td className="px-3.5 py-2.5 text-sm font-semibold">
                    {ing.nombre}
                    {ing.variacion >= 5 && (
                      <Chip tone="bad" className="ml-2">
                        ▲ +{ing.variacion}%
                      </Chip>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {ing.esFijo ? (
                      <span className="text-sm text-ink-soft">—</span>
                    ) : (
                      <CampoNumero
                        valorInicial={ing.cantidad ?? 0}
                        sufijo={ing.unidad ?? ""}
                        paso="0.001"
                        onGuardar={(v) =>
                          ejecutar(() => actualizarIngrediente(ing.id, plato.id, { cantidad: v }))
                        }
                      />
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 font-display text-sm font-semibold">
                    {ing.esFijo ? (
                      <CampoNumero
                        valorInicial={ing.coste}
                        sufijo="€"
                        paso="0.01"
                        onGuardar={(v) => ejecutar(() => actualizarIngrediente(ing.id, plato.id, { costeFijo: v }))}
                      />
                    ) : ing.precioUnitario !== null ? (
                      `${ing.precioUnitario.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/${ing.unidad}`
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 font-display text-sm font-semibold">{eur(ing.coste)}</td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => ejecutar(() => eliminarIngrediente(ing.id, plato.id))}
                      className="cursor-pointer rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-bad-soft hover:text-bad"
                      aria-label={`Eliminar ${ing.nombre}`}
                    >
                      <X className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Alta: ingrediente de catálogo */}
              <tr className="border-b border-line bg-hover/60">
                <td className="px-3.5 py-2.5" colSpan={2}>
                  <select
                    value={nuevoProductoId}
                    onChange={(e) => setNuevoProductoId(e.target.value)}
                    className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                  >
                    <option value="">+ Añadir producto del catálogo…</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} · {p.precio}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3.5 py-2.5">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="cantidad"
                    value={nuevaCantidad}
                    onChange={(e) => setNuevaCantidad(e.target.value)}
                    className="w-24 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                  />
                </td>
                <td className="px-3.5 py-2.5" colSpan={2}>
                  <button
                    onClick={() =>
                      ejecutar(async () => {
                        const res = await agregarIngrediente(plato.id, {
                          productoId: nuevoProductoId,
                          cantidad: parseFloat(nuevaCantidad.replace(",", ".")),
                        });
                        if (res.ok) {
                          setNuevoProductoId("");
                          setNuevaCantidad("");
                        }
                        return res;
                      })
                    }
                    disabled={!nuevoProductoId || !nuevaCantidad || ocupado}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
                  >
                    <Plus className="size-3.5" /> Añadir
                  </button>
                </td>
              </tr>

              {/* Alta: línea fija */}
              <tr className="border-b border-line bg-hover/60">
                <td className="px-3.5 py-2.5" colSpan={2}>
                  <input
                    placeholder="+ O línea fija: especias, elaboración, varios…"
                    value={nuevaDescripcion}
                    onChange={(e) => setNuevaDescripcion(e.target.value)}
                    className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                  />
                </td>
                <td className="px-3.5 py-2.5">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="importe €"
                    value={nuevoImporte}
                    onChange={(e) => setNuevoImporte(e.target.value)}
                    className="w-24 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                  />
                </td>
                <td className="px-3.5 py-2.5" colSpan={2}>
                  <button
                    onClick={() =>
                      ejecutar(async () => {
                        const res = await agregarIngrediente(plato.id, {
                          descripcion: nuevaDescripcion,
                          costeFijo: parseFloat(nuevoImporte.replace(",", ".")),
                        });
                        if (res.ok) {
                          setNuevaDescripcion("");
                          setNuevoImporte("");
                        }
                        return res;
                      })
                    }
                    disabled={!nuevaDescripcion.trim() || !nuevoImporte || ocupado}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
                  >
                    <Plus className="size-3.5" /> Añadir
                  </button>
                </td>
              </tr>

              <tr className="border-b border-line">
                <td colSpan={3} className="px-3.5 py-2.5 text-sm text-ink-soft">
                  Subtotal ingredientes
                </td>
                <td colSpan={2} className="px-3.5 py-2.5 font-display text-sm font-semibold">
                  {eur(plato.subtotal)}
                </td>
              </tr>
              <tr className="border-b border-line">
                <td colSpan={3} className="px-3.5 py-2.5 text-sm text-ink-soft">
                  Merma y varios
                  <span className="ml-2 inline-flex items-center gap-1">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={mermaTexto}
                      onChange={(e) => setMermaTexto(e.target.value)}
                      onBlur={() => {
                        const v = parseFloat(mermaTexto.replace(",", "."));
                        if (Number.isFinite(v) && v !== plato.mermaPct) {
                          ejecutar(() => actualizarPlato(plato.id, { mermaPct: v }));
                        }
                      }}
                      className="w-14 rounded-lg border border-line bg-card px-2 py-1 text-center text-sm outline-none focus:border-brand"
                    />
                    <span className="text-sm">%</span>
                  </span>
                </td>
                <td colSpan={2} className="px-3.5 py-2.5 font-display text-sm font-semibold">
                  {eur(plato.coste - plato.subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="px-3.5 py-3 font-display text-sm font-bold">
                  Coste total del plato
                </td>
                <td colSpan={2} className="px-3.5 py-3 font-display text-[17px] font-bold">
                  {eur(plato.coste)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card p-5.5">
          <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Precio en carta</div>
          <div className="mt-2 mb-1.5 flex items-baseline gap-1.5">
            <input
              type="number"
              step="0.5"
              min="0"
              value={pvpTexto}
              placeholder="—"
              onChange={(e) => setPvpTexto(e.target.value)}
              className="w-[120px] border-b-2 border-line bg-transparent font-display text-4xl font-bold tracking-tight outline-none transition-colors focus:border-brand"
            />
            <span className="font-display text-[22px] font-semibold text-ink-soft">€</span>
          </div>
          <button
            onClick={() => ejecutar(() => actualizarPlato(plato.id, { pvp: pvpActual }))}
            disabled={ocupado}
            className="mb-4.5 cursor-pointer rounded-xl bg-ink px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {ocupado ? "Guardando…" : "Guardar PVP"}
          </button>

          <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Food cost</div>
          <div className="mt-1.5">
            <div className="relative h-3 rounded-full bg-chip">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(foodCost ?? 0, 100)}%`, background: colorFc }}
              />
              <div
                className="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-ink"
                style={{ left: `${OBJETIVO}%` }}
                title={`Objetivo ${OBJETIVO}%`}
              />
            </div>
            <div className="mt-2.5 flex items-baseline justify-between">
              <span className="font-display text-[26px] font-bold">
                {foodCost !== null ? pct(foodCost) : "—"}
              </span>
              <small className="text-xs text-ink-soft">objetivo ≤ {OBJETIVO}%</small>
            </div>
          </div>

          <div className="mt-4.5 flex flex-col gap-2.5 border-t border-line pt-3.5 text-[13.5px]">
            <div className="flex justify-between">
              <span className="text-ink-soft">Margen bruto por plato</span>
              <b className="font-display font-bold">{pvpActual !== null ? eur(pvpActual - plato.coste) : "—"}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-soft">PVP para food cost {OBJETIVO}%</span>
              <b className="font-display font-bold">{eur(plato.coste / (OBJETIVO / 100))}</b>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function CampoNumero({
  valorInicial,
  sufijo,
  paso,
  onGuardar,
}: {
  valorInicial: number;
  sufijo: string;
  paso: string;
  onGuardar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(valorInicial));
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        step={paso}
        min="0"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const v = parseFloat(texto.replace(",", "."));
          if (Number.isFinite(v) && v !== valorInicial) onGuardar(v);
        }}
        className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-sm outline-none focus:border-brand"
      />
      <span className="text-xs text-ink-soft">{sufijo}</span>
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}
