"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { clasesMesaPlano } from "../mapa-client";
import { actualizarMesa, crearMesa, moverMesa } from "../actions";

export type MesaFila = {
  id: string;
  nombre: string;
  zona: "sala" | "terraza" | "barra";
  capacidad: number;
  forma: "cuadrada" | "redonda" | "alargada";
  posX: number | null;
  posY: number | null;
  combinable: boolean;
  activo: boolean;
};

const ZONAS: { id: "sala" | "terraza" | "barra"; nombre: string }[] = [
  { id: "sala", nombre: "Sala" },
  { id: "terraza", nombre: "Terraza" },
  { id: "barra", nombre: "Barra" },
];

const FORMAS: { id: MesaFila["forma"]; nombre: string }[] = [
  { id: "cuadrada", nombre: "Cuadrada" },
  { id: "redonda", nombre: "Redonda" },
  { id: "alargada", nombre: "Alargada" },
];

export function MesasClient({ mesas }: { mesas: MesaFila[] }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaZona, setNuevaZona] = useState<"sala" | "terraza" | "barra">("sala");
  const [nuevaCap, setNuevaCap] = useState("4");

  // ── Plano: posiciones locales mientras se arrastra ──
  const lienzo = useRef<HTMLDivElement>(null);
  const [posiciones, setPosiciones] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(
      mesas.filter((m) => m.posX !== null && m.posY !== null).map((m) => [m.id, { x: m.posX!, y: m.posY! }]),
    ),
  );
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  const activas = mesas.filter((m) => m.activo);
  const colocadas = activas.filter((m) => posiciones[m.id]);
  const sinColocar = activas.filter((m) => !posiciones[m.id]);

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>, alTerminar?: () => void) {
    setError(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      if (alTerminar) alTerminar();
      router.refresh();
    });
  }

  function posDesdeEvento(e: React.PointerEvent): { x: number; y: number } | null {
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(96, Math.max(4, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  return (
    <>
      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      {/* ── Plano del local (arrastra cada mesa a su sitio) ── */}
      <h3 className="mb-2 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
        Plano del local — arrastra cada mesa a su sitio real
      </h3>
      <div
        ref={lienzo}
        onPointerMove={(e) => {
          if (!arrastrando) return;
          const pos = posDesdeEvento(e);
          if (pos) setPosiciones((prev) => ({ ...prev, [arrastrando]: pos }));
        }}
        onPointerUp={() => {
          if (!arrastrando) return;
          const pos = posiciones[arrastrando];
          const id = arrastrando;
          setArrastrando(null);
          if (pos) ejecutar(() => moverMesa(id, pos.x, pos.y));
        }}
        className="card relative mb-3 w-full touch-none overflow-hidden select-none"
        style={{
          aspectRatio: "16/9",
          backgroundImage: "radial-gradient(circle, #E8E1D4 1.2px, transparent 1.2px)",
          backgroundSize: "26px 26px",
        }}
      >
        {colocadas.map((mesa) => {
          const pos = posiciones[mesa.id];
          return (
            <div
              key={mesa.id}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                setArrastrando(mesa.id);
              }}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center justify-center border-2 bg-card p-1 text-center transition-shadow",
                clasesMesaPlano(mesa),
                arrastrando === mesa.id
                  ? "z-10 cursor-grabbing border-brand shadow-(--shadow-lift)"
                  : "border-[#C9BFAC]",
              )}
            >
              <b className="font-display text-[13px] leading-tight font-bold">{mesa.nombre}</b>
              <span className="flex items-center gap-0.5 text-[10.5px] text-ink-soft">
                <Users className="size-3" /> {mesa.capacidad}
              </span>
            </div>
          );
        })}
        {colocadas.length === 0 && (
          <p className="absolute inset-0 grid place-items-center text-sm text-ink-soft">
            Coloca tus mesas con el botón "Al plano" de la lista de abajo
          </p>
        )}
      </div>
      {sinColocar.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
          Sin colocar:
          {sinColocar.map((m) => (
            <button
              key={m.id}
              onClick={() => ejecutar(() => moverMesa(m.id, 50, 50))}
              className="cursor-pointer rounded-full border border-line bg-card px-3 py-1 font-semibold transition-colors hover:border-brand"
            >
              {m.nombre} → al plano
            </button>
          ))}
        </div>
      )}

      {/* ── Alta de mesa ── */}
      <div className="card mb-3.5 flex flex-wrap items-end gap-3 p-4">
        <label className="flex-1 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Nueva mesa
          <input
            placeholder="Mesa 7, Reservado, Barra 3…"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
          />
        </label>
        <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Zona
          <select
            value={nuevaZona}
            onChange={(e) => setNuevaZona(e.target.value as typeof nuevaZona)}
            className="mt-1.5 block rounded-xl border border-line bg-card px-3.5 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
          >
            {ZONAS.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Capacidad
          <input
            type="number"
            min="1"
            max="30"
            value={nuevaCap}
            onChange={(e) => setNuevaCap(e.target.value)}
            className="mt-1.5 block w-24 rounded-xl border border-line bg-card px-3.5 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
          />
        </label>
        <button
          onClick={() =>
            ejecutar(
              () => crearMesa({ nombre: nuevoNombre, zona: nuevaZona, capacidad: parseInt(nuevaCap, 10) }),
              () => setNuevoNombre(""),
            )
          }
          disabled={!nuevoNombre.trim() || ocupado}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
        >
          <Plus className="size-4" /> Añadir
        </button>
      </div>

      {/* ── Lista editable ── */}
      {ZONAS.map((zona) => {
        const deZona = mesas.filter((m) => m.zona === zona.id);
        if (deZona.length === 0) return null;
        return (
          <div key={zona.id} className="mb-5">
            <h3 className="mb-2 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              {zona.nombre}
            </h3>
            <div className="card overflow-hidden">
              {deZona.map((mesa) => (
                <div
                  key={mesa.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-none",
                    !mesa.activo && "opacity-45",
                  )}
                >
                  <CampoTexto
                    valorInicial={mesa.nombre}
                    onGuardar={(v) => ejecutar(() => actualizarMesa(mesa.id, { nombre: v }))}
                  />
                  <select
                    value={mesa.zona}
                    onChange={(e) =>
                      ejecutar(() => actualizarMesa(mesa.id, { zona: e.target.value as MesaFila["zona"] }))
                    }
                    className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                  >
                    {ZONAS.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nombre}
                      </option>
                    ))}
                  </select>
                  <select
                    value={mesa.forma}
                    onChange={(e) =>
                      ejecutar(() => actualizarMesa(mesa.id, { forma: e.target.value as MesaFila["forma"] }))
                    }
                    className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                  >
                    {FORMAS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nombre}
                      </option>
                    ))}
                  </select>
                  <span className="flex items-center gap-1.5 text-sm text-ink-soft">
                    <Users className="size-4" />
                    <CampoNumero
                      valorInicial={mesa.capacidad}
                      onGuardar={(v) => ejecutar(() => actualizarMesa(mesa.id, { capacidad: v }))}
                    />
                  </span>
                  <button
                    onClick={() => ejecutar(() => actualizarMesa(mesa.id, { combinable: !mesa.combinable }))}
                    title="Si puede juntarse con otra mesa cercana para grupos grandes"
                    className={cn(
                      "ml-auto cursor-pointer rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                      mesa.combinable ? "bg-warn-soft text-warn" : "bg-chip text-ink-soft",
                    )}
                  >
                    {mesa.combinable ? "se junta" : "fija"}
                  </button>
                  <button
                    onClick={() => ejecutar(() => actualizarMesa(mesa.id, { activo: !mesa.activo }))}
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                      mesa.activo ? "bg-good-soft text-good hover:bg-bad-soft hover:text-bad" : "bg-chip text-ink-soft",
                    )}
                  >
                    {mesa.activo ? "activa" : "desactivada"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function CampoTexto({ valorInicial, onGuardar }: { valorInicial: string; onGuardar: (v: string) => void }) {
  const [texto, setTexto] = useState(valorInicial);
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto.trim() && texto !== valorInicial && onGuardar(texto)}
      className="w-40 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold outline-none hover:border-line focus:border-brand"
    />
  );
}

function CampoNumero({ valorInicial, onGuardar }: { valorInicial: number; onGuardar: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valorInicial));
  return (
    <input
      type="number"
      min="1"
      max="30"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const v = parseInt(texto, 10);
        if (Number.isFinite(v) && v !== valorInicial) onGuardar(v);
      }}
      className="w-14 rounded-lg border border-line bg-card px-2 py-1 text-center text-sm outline-none focus:border-brand"
    />
  );
}
