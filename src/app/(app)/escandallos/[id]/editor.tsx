"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Chip } from "@/components/ui";
import { type PlatoDetalle } from "@/lib/db/queries";
import { cn, eur, pct } from "@/lib/utils";
import { FotoPlato } from "./foto-plato";
import { BuscadorProducto } from "./buscador-producto";
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
  const [racionesTexto, setRacionesTexto] = useState(String(plato.raciones));
  const [margenObjTexto, setMargenObjTexto] = useState(
    plato.margenObjetivo !== null ? String(plato.margenObjetivo) : "",
  );

  // Alta de ingrediente
  const [nuevoProductoId, setNuevoProductoId] = useState("");
  const [nuevaCantidad, setNuevaCantidad] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevoImporte, setNuevoImporte] = useState("");
  const [nuevaPrepId, setNuevaPrepId] = useState("");
  const [nuevaPrepCant, setNuevaPrepCant] = useState("");
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  const costeLote = plato.coste * plato.raciones;

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
            onGuardarEmoji={(e) => e !== plato.emoji && ejecutar(() => actualizarPlato(plato.id, { emoji: e }))}
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={plato.tipoPlato}
                onChange={(e) =>
                  ejecutar(() =>
                    actualizarPlato(plato.id, {
                      tipoPlato: e.target.value as "entrante" | "principal" | "postre" | "bebida" | "otro",
                    }),
                  )
                }
                className="rounded-lg border border-line bg-card px-2 py-1 text-[12.5px] font-semibold capitalize outline-none focus:border-brand"
              >
                {["entrante", "principal", "postre", "bebida", "otro"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={() => ejecutar(() => actualizarPlato(plato.id, { esPreparacion: !plato.esPreparacion }))}
                title="Una preparación (vinagreta, sofrito…) se usa como ingrediente en otros platos"
                className={cn(
                  "cursor-pointer rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
                  plato.esPreparacion
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-line text-ink-soft hover:border-[#CFC6B4]",
                )}
              >
                {plato.esPreparacion ? "★ Preparación" : "Marcar como preparación"}
              </button>
              <span className="flex items-center gap-1 text-[12.5px] text-ink-soft">
                salen
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={racionesTexto}
                  onChange={(e) => setRacionesTexto(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(racionesTexto.replace(",", "."));
                    if (Number.isFinite(v) && v > 0 && v !== plato.raciones) {
                      ejecutar(() => actualizarPlato(plato.id, { raciones: v }));
                    }
                  }}
                  className="w-14 rounded-lg border border-line bg-card px-1.5 py-0.5 text-center text-[12.5px] outline-none focus:border-brand"
                />
                {parseFloat(racionesTexto) === 1 ? "ración" : "raciones"}
              </span>
            </div>
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

      {plato.tipoPlato === "bebida" && (
        <div className="mb-3.5 rounded-[14px] border border-line bg-hover px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
          🍹 <b className="text-ink">Bebida:</b> pon el <b className="text-ink">coste de compra</b> (lo que te cuesta la
          unidad) como una línea fija abajo — o elige el producto del catálogo si lo tienes — y arriba a la derecha el{" "}
          <b className="text-ink">PVP</b>. El food cost se calcula solo.
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
                  <BuscadorProducto productos={productos} valor={nuevoProductoId} onElegir={setNuevoProductoId} />
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

              {/* Alta: preparación (sub-receta) como ingrediente */}
              {!plato.esPreparacion && plato.preparacionesDisponibles.length > 0 && (
                <tr className="border-b border-line bg-hover/60">
                  <td className="px-3.5 py-2.5" colSpan={2}>
                    <select
                      value={nuevaPrepId}
                      onChange={(e) => setNuevaPrepId(e.target.value)}
                      className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                    >
                      <option value="">+ Añadir preparación (vinagreta, sofrito…)</option>
                      {plato.preparacionesDisponibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} · {eur(p.costeRacion)}/ración
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="raciones"
                      value={nuevaPrepCant}
                      onChange={(e) => setNuevaPrepCant(e.target.value)}
                      className="w-24 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                    />
                  </td>
                  <td className="px-3.5 py-2.5" colSpan={2}>
                    <button
                      onClick={() =>
                        ejecutar(async () => {
                          const res = await agregarIngrediente(plato.id, {
                            preparacionId: nuevaPrepId,
                            cantidad: parseFloat(nuevaPrepCant.replace(",", ".")),
                          });
                          if (res.ok) {
                            setNuevaPrepId("");
                            setNuevaPrepCant("");
                          }
                          return res;
                        })
                      }
                      disabled={!nuevaPrepId || !nuevaPrepCant || ocupado}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
                    >
                      <Plus className="size-3.5" /> Añadir
                    </button>
                  </td>
                </tr>
              )}

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
                  {eur(costeLote - plato.subtotal)}
                </td>
              </tr>
              {plato.raciones !== 1 && (
                <tr className="border-b border-line">
                  <td colSpan={3} className="px-3.5 py-2.5 text-sm text-ink-soft">
                    Coste del lote ({plato.raciones} raciones)
                  </td>
                  <td colSpan={2} className="px-3.5 py-2.5 font-display text-sm font-semibold">
                    {eur(costeLote)}
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={3} className="px-3.5 py-3 font-display text-sm font-bold">
                  {plato.esPreparacion ? "Coste por ración de la preparación" : "Coste por ración"}
                </td>
                <td colSpan={2} className="px-3.5 py-3 font-display text-[17px] font-bold">
                  {eur(plato.coste)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {plato.esPreparacion ? (
          <div className="card p-5.5">
            <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Preparación</div>
            <div className="mt-2 font-display text-4xl font-bold tracking-tight">{eur(plato.coste)}</div>
            <div className="mt-1 text-[13px] text-ink-soft">coste por ración</div>
            <p className="mt-4 rounded-xl bg-chip px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
              Esta receta no se vende en carta: úsala como <b className="text-ink">ingrediente</b> dentro de otros
              platos. Cuando suba el precio de sus productos, el coste se propaga solo a todos los platos que la
              llevan.
            </p>
          </div>
        ) : (
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

          {/* Margen esperado (haddock): fija un % y te recomienda el PVP */}
          <div className="mt-4.5 border-t border-line pt-3.5">
            <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Margen esperado
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="1"
                min="0"
                max="99"
                value={margenObjTexto}
                placeholder="—"
                onChange={(e) => setMargenObjTexto(e.target.value)}
                onBlur={() => {
                  const limpio = margenObjTexto.trim().replace(",", ".");
                  const v = limpio === "" ? null : parseFloat(limpio);
                  if (v !== (plato.margenObjetivo ?? null) && (v === null || Number.isFinite(v))) {
                    ejecutar(() => actualizarPlato(plato.id, { margenObjetivo: v }));
                  }
                }}
                className="w-16 rounded-lg border border-line bg-card px-2 py-1.5 text-center font-display text-[17px] font-bold outline-none focus:border-brand"
              />
              <span className="text-sm text-ink-soft">% de margen que quieres sacarle</span>
            </div>
            {plato.margenObjetivo !== null && (
              <div className="mt-3 flex flex-col gap-2 text-[13.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-ink-soft">Margen actual</span>
                  <b
                    className={cn(
                      "font-display text-[15px] font-bold",
                      plato.margen === null ? "" : plato.bajoObjetivo ? "text-bad" : "text-good",
                    )}
                  >
                    {plato.margen !== null ? pct(plato.margen) : "—"}
                  </b>
                </div>
                {plato.pvpRecomendado !== null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-soft">PVP recomendado</span>
                    <span className="flex items-center gap-2">
                      <b className="font-display text-[15px] font-bold">{eur(plato.pvpRecomendado)}</b>
                      <button
                        onClick={() => {
                          const redondo = Math.round(plato.pvpRecomendado! * 100) / 100;
                          setPvpTexto(String(redondo));
                          ejecutar(() => actualizarPlato(plato.id, { pvp: redondo }));
                        }}
                        disabled={ocupado}
                        className="cursor-pointer rounded-lg bg-brand px-2.5 py-1 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        Aplicar
                      </button>
                    </span>
                  </div>
                )}
                {plato.bajoObjetivo && (
                  <p className="rounded-lg bg-bad-soft px-2.5 py-2 text-[12.5px] font-semibold text-bad">
                    Estás por debajo del margen esperado: sube el PVP o revisa los ingredientes.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        )}
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
