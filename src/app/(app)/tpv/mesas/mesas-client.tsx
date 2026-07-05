"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { clasesMesaPlano, dimsMesaPlano, estiloMesaPlano } from "../mapa-client";
import { actualizarMesa, crearMesa, moverMesa } from "../actions";

// ── Detección de solapes (en píxeles: isótropo, más fácil que mezclar %) ──
type RectPx = { cx: number; cy: number; w: number; h: number };
const GAP_PX = 6; // separación mínima entre mesas

// Rectángulo en px de una mesa colocada en (x,y) en % dentro de un lienzo WxH.
// dimsMesaPlano da w/h en % del ANCHO, así que ambos se multiplican por W.
function rectPx(mesa: { capacidad: number; forma: string }, x: number, y: number, W: number, H: number): RectPx {
  const d = dimsMesaPlano(mesa);
  return { cx: (x / 100) * W, cy: (y / 100) * H, w: (d.w / 100) * W, h: (d.h / 100) * W };
}

function solapan(a: RectPx, b: RectPx): boolean {
  return Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + GAP_PX && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2 + GAP_PX;
}

// Posición (en %) más cercana a (x,y) donde la mesa NO solapa a ninguna otra
// y cabe entera dentro del lienzo. Búsqueda en anillos concéntricos.
function resolverPos(
  mesa: { capacidad: number; forma: string },
  x: number,
  y: number,
  otras: RectPx[],
  W: number,
  H: number,
): { x: number; y: number } {
  const d = dimsMesaPlano(mesa);
  const wpx = (d.w / 100) * W;
  const hpx = (d.h / 100) * W;
  const clampX = (cx: number) => Math.min(W - wpx / 2, Math.max(wpx / 2, cx));
  const clampY = (cy: number) => Math.min(H - hpx / 2, Math.max(hpx / 2, cy));
  const cabe = (cx: number, cy: number) => otras.every((o) => !solapan({ cx, cy, w: wpx, h: hpx }, o));

  const cx0 = clampX((x / 100) * W);
  const cy0 = clampY((y / 100) * H);
  if (cabe(cx0, cy0)) return { x: (cx0 / W) * 100, y: (cy0 / H) * 100 };

  for (let r = 1; r <= 90; r++) {
    for (let a = 0; a < 360; a += 12) {
      const rad = (a * Math.PI) / 180;
      const cx = clampX(cx0 + r * 8 * Math.cos(rad));
      const cy = clampY(cy0 + r * 8 * Math.sin(rad));
      if (cabe(cx, cy)) return { x: (cx / W) * 100, y: (cy / H) * 100 };
    }
  }
  return { x: (cx0 / W) * 100, y: (cy0 / H) * 100 };
}

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
  const [solapando, setSolapando] = useState(false); // la mesa que arrastro pisa a otra

  const activas = mesas.filter((m) => m.activo);
  const colocadas = activas.filter((m) => posiciones[m.id]);
  const sinColocar = activas.filter((m) => !posiciones[m.id]);

  // Rectángulos (px) de las mesas colocadas, excluyendo una (la que se mueve).
  function otrosRect(excluir: string, W: number, H: number): RectPx[] {
    return colocadas
      .filter((m) => m.id !== excluir && posiciones[m.id])
      .map((m) => rectPx(m, posiciones[m.id].x, posiciones[m.id].y, W, H));
  }

  // Separa las mesas que hayan quedado solapadas, respetando al máximo dónde
  // están (recoloca solo las que chocan, de arriba a abajo).
  function ordenar() {
    const rect = lienzo.current?.getBoundingClientRect();
    if (!rect || colocadas.length === 0) return;
    const { width: W, height: H } = rect;
    const orden = [...colocadas].sort(
      (a, b) => posiciones[a.id].y - posiciones[b.id].y || posiciones[a.id].x - posiciones[b.id].x,
    );
    const fijadas: RectPx[] = [];
    const nuevas: Record<string, { x: number; y: number }> = {};
    for (const m of orden) {
      const p = posiciones[m.id];
      const fin = resolverPos(m, p.x, p.y, fijadas, W, H);
      nuevas[m.id] = fin;
      fijadas.push(rectPx(m, fin.x, fin.y, W, H));
    }
    const cambiadas = orden.filter(
      (m) => Math.abs(posiciones[m.id].x - nuevas[m.id].x) > 0.1 || Math.abs(posiciones[m.id].y - nuevas[m.id].y) > 0.1,
    );
    setPosiciones((prev) => ({ ...prev, ...nuevas }));
    if (cambiadas.length === 0) return;
    setError(null);
    startAccion(async () => {
      for (const m of cambiadas) await moverMesa(m.id, nuevas[m.id].x, nuevas[m.id].y);
      router.refresh();
    });
  }

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
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Plano del local — arrastra cada mesa a su sitio real
        </h3>
        {colocadas.length > 1 && (
          <button
            onClick={ordenar}
            disabled={ocupado}
            title="Separa las mesas que hayan quedado una encima de otra"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-brand disabled:opacity-40"
          >
            <Wand2 className="size-3.5 text-ink-soft" /> Separar solapadas
          </button>
        )}
      </div>
      {/* container-type: las mesas van en cqw (% del ancho del LIENZO, no de
          la ventana) — sin esto el editor las pintaba más grandes que el TPV
          y el plano montado aquí no coincidía con el de sala. */}
      <div
        ref={lienzo}
        onPointerMove={(e) => {
          if (!arrastrando) return;
          const pos = posDesdeEvento(e);
          if (!pos) return;
          setPosiciones((prev) => ({ ...prev, [arrastrando]: pos }));
          // Aviso visual: se pinta en rojo si pisaría a otra mesa.
          const rect = lienzo.current?.getBoundingClientRect();
          const mesa = activas.find((m) => m.id === arrastrando);
          if (rect && mesa) {
            const yo = rectPx(mesa, pos.x, pos.y, rect.width, rect.height);
            setSolapando(otrosRect(arrastrando, rect.width, rect.height).some((o) => solapan(yo, o)));
          }
        }}
        onPointerUp={() => {
          if (!arrastrando) return;
          const id = arrastrando;
          const pos = posiciones[id];
          setArrastrando(null);
          setSolapando(false);
          if (!pos) return;
          // Al soltar, la mesa se aparta sola al hueco libre más cercano.
          const rect = lienzo.current?.getBoundingClientRect();
          const mesa = activas.find((m) => m.id === id);
          const fin =
            rect && mesa ? resolverPos(mesa, pos.x, pos.y, otrosRect(id, rect.width, rect.height), rect.width, rect.height) : pos;
          setPosiciones((prev) => ({ ...prev, [id]: fin }));
          ejecutar(() => moverMesa(id, fin.x, fin.y));
        }}
        className="card relative mb-3 w-full touch-none overflow-hidden select-none [container-type:inline-size]"
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
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, ...estiloMesaPlano(mesa) }}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab flex-col items-center justify-center overflow-hidden border-2 bg-card p-[0.4cqw] text-center leading-tight transition-shadow",
                clasesMesaPlano(mesa),
                arrastrando === mesa.id
                  ? solapando
                    ? "z-10 cursor-grabbing border-bad bg-bad-soft shadow-(--shadow-lift)"
                    : "z-10 cursor-grabbing border-brand shadow-(--shadow-lift)"
                  : "border-[#C9BFAC]",
              )}
            >
              <b className="font-display text-[clamp(8px,1.3cqw,13px)] font-bold">{mesa.nombre}</b>
              <span className="flex items-center gap-0.5 text-[clamp(7px,1.05cqw,10.5px)] text-ink-soft">
                <Users className="size-[clamp(7px,1.1cqw,12px)]" /> {mesa.capacidad}
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
              onClick={() => {
                // La coloca en un hueco libre (evita caer encima de otra).
                const rect = lienzo.current?.getBoundingClientRect();
                const fin = rect
                  ? resolverPos(m, 50, 50, otrosRect(m.id, rect.width, rect.height), rect.width, rect.height)
                  : { x: 50, y: 50 };
                setPosiciones((prev) => ({ ...prev, [m.id]: fin }));
                ejecutar(() => moverMesa(m.id, fin.x, fin.y));
              }}
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
