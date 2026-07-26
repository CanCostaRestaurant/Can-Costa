"use client";

// COMANDERO MÓVIL — el TPV de bolsillo del camarero, calcado del patrón
// Toast Go / Square handheld: elegir mesa → tocar platos en grande → 🔥
// enviar a cocina. Sin cobro (eso vive en la tablet fija). Súper visual:
// tarjetas gordas con emoji, badge de cantidad, barra fija abajo con el
// pulgar y la comanda como hoja inferior para ajustar y poner notas.
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flame, Minus, NotebookPen, Plus, ReceiptText, ShoppingBag, Users, X } from "lucide-react";
import { type MapaMesasTpv, type MesaEstado, type PlatoTpv, type TicketDetalle } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { abrirTicket, cambiarComensales } from "../actions";
import { enviarACocina, fijarLinea, fijarNotaLinea } from "../comanda-actions";

// ═══════════════════════════ Pantalla 1: MESAS ═══════════════════════════

function tiempo(minutos: number): string {
  if (minutos < 60) return `${minutos}m`;
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, "0")}m`;
}

export function ComanderoMesas({ mapa }: { mapa: MapaMesasTpv }) {
  const router = useRouter();
  const [abriendo, startAbrir] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function abrir(mesa: MesaEstado | null) {
    setError(null);
    if (mesa?.ticket) {
      router.push(`/tpv/comandero?ticket=${mesa.ticket.id}`);
      return;
    }
    startAbrir(async () => {
      const res = await abrirTicket(mesa?.id ?? null);
      if (!res.ok || !res.id) {
        setError(res.error ?? "No se pudo abrir la mesa");
        return;
      }
      router.push(`/tpv/comandero?ticket=${res.id}`);
    });
  }

  return (
    <section className="anim-in mx-auto max-w-lg pb-6">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="grid size-9 place-items-center rounded-xl bg-brand text-white">
          <Flame className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-lg leading-tight font-bold tracking-tight">Comandero</h1>
          <p className="text-[12px] leading-tight text-ink-soft">Toca una mesa y pasa el pedido</p>
        </div>
      </div>

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      {mapa.zonas.map((zona) => (
        <div key={zona.zona} className="mb-5">
          <h3 className="mb-2 text-[11.5px] font-bold tracking-[0.18em] text-ink-soft uppercase">{zona.titulo}</h3>
          <div className="grid grid-cols-3 gap-2">
            {zona.mesas.map((mesa) => (
              <button
                key={mesa.id}
                onClick={() => abrir(mesa)}
                disabled={abriendo}
                className={cn(
                  "flex min-h-21 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 py-2.5 transition-all active:scale-95",
                  mesa.ticket
                    ? "border-brand bg-brand text-white shadow-(--shadow-lift)"
                    : "border-dashed border-[#D8CFBE] bg-card",
                )}
              >
                <b className="font-display text-[17px] leading-none font-bold">{mesa.nombre}</b>
                {mesa.ticket ? (
                  <>
                    <span className="font-display text-[14px] leading-tight font-bold">{eur(mesa.ticket.total)}</span>
                    <span className="text-[10.5px] leading-none opacity-80">{tiempo(mesa.ticket.minutos)}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-[11.5px] text-ink-soft">
                    <Users className="size-3" /> {mesa.capacidad}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      <h3 className="mb-2 text-[11.5px] font-bold tracking-[0.18em] text-ink-soft uppercase">Para llevar</h3>
      <div className="flex flex-wrap gap-2">
        {mapa.paraLlevar.map((t) => (
          <button
            key={t.id}
            onClick={() => router.push(`/tpv/comandero?ticket=${t.id}`)}
            className="flex min-h-14 cursor-pointer items-center gap-2 rounded-2xl border-2 border-brand bg-brand-soft px-4 py-2 active:scale-95"
          >
            <ShoppingBag className="size-4.5 text-brand" />
            <span className="font-display text-[15px] font-bold">{eur(t.total)}</span>
            <span className="text-[10.5px] font-semibold text-ink-soft">{tiempo(t.minutos)}</span>
          </button>
        ))}
        <button
          onClick={() => abrir(null)}
          disabled={abriendo}
          className="flex min-h-14 cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-[#D8CFBE] bg-card px-4 py-2 text-[13.5px] font-semibold text-ink-soft active:scale-95"
        >
          <ShoppingBag className="size-4.5" /> + Nuevo
        </button>
      </div>
    </section>
  );
}

// ═══════════════════════ Pantalla 2: COMANDA MÓVIL ═══════════════════════
// Mismo motor local→sync que la comanda de tablet: cantidades ABSOLUTAS con
// fijarLinea (idempotente, sin carreras al tocar deprisa) y delta de cocina
// con enviadosRef.

type LineaLocal = {
  key: string;
  platoId: string | null;
  descripcion: string;
  precio: number;
  cantidad: number;
  nota: string | null;
};

const claveDe = (platoId: string | null, descripcion: string, precio: number) =>
  platoId ? `p:${platoId}` : `l:${descripcion}|${precio.toFixed(2)}`;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Categoria = { id: string; etiqueta: string; platos: PlatoTpv[] };

export function ComanderoComanda({ ticket, platos }: { ticket: TicketDetalle; platos: PlatoTpv[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const [pases, setPases] = useState(0);
  const [libreDesc, setLibreDesc] = useState("");
  const [librePrecio, setLibrePrecio] = useState("");
  const [, startAccion] = useTransition();

  const aLocal = (l: TicketDetalle["lineas"][number]): LineaLocal => ({
    key: claveDe(l.platoId, l.descripcion, l.precioUnitario),
    platoId: l.platoId,
    descripcion: l.descripcion,
    precio: l.precioUnitario,
    cantidad: l.cantidad,
    nota: l.nota,
  });

  const [lineas, setLineas] = useState<LineaLocal[]>(() =>
    ticket.lineas.map(aLocal).filter((l) => l.cantidad > 0),
  );
  const lineasRef = useRef(lineas);
  const sincronizadoRef = useRef(new Map(lineas.map((l) => [l.key, { ...l }] as const)));
  const enviadosRef = useRef(
    new Map(ticket.lineas.map((l) => [claveDe(l.platoId, l.descripcion, l.precioUnitario), l.enviado] as const)),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardandoRef = useRef(false);

  const total = useMemo(
    () => lineas.reduce((a, l) => a + Math.round(l.precio * l.cantidad * 100) / 100, 0),
    [lineas],
  );
  const unidades = useMemo(() => lineas.reduce((a, l) => a + l.cantidad, 0), [lineas]);

  // ── Motor de sincronización (idéntico patrón que la tablet) ──
  function tareas(previo: Map<string, LineaLocal>, actual: Map<string, LineaLocal>) {
    const t: { linea: LineaLocal; cantidad: number }[] = [];
    for (const [key, l] of actual) if (previo.get(key)?.cantidad !== l.cantidad) t.push({ linea: l, cantidad: l.cantidad });
    for (const [key, l] of previo) if (!actual.has(key)) t.push({ linea: l, cantidad: 0 });
    return t;
  }
  const mapaActual = () => new Map(lineasRef.current.map((l) => [l.key, { ...l }] as const));

  async function sincronizar(): Promise<boolean> {
    if (guardandoRef.current) return true;
    const actual = mapaActual();
    const pendientes = tareas(sincronizadoRef.current, actual);
    if (pendientes.length === 0) return true;
    guardandoRef.current = true;
    try {
      for (const p of pendientes) {
        const res = await fijarLinea(
          ticket.id,
          p.linea.platoId ? { platoId: p.linea.platoId } : { descripcion: p.linea.descripcion, precio: p.linea.precio },
          p.cantidad,
        );
        if (!res.ok) {
          setError(res.error ?? "No se pudo guardar — reintenta");
          return false;
        }
      }
      sincronizadoRef.current = actual;
      return true;
    } finally {
      guardandoRef.current = false;
    }
  }

  function programar(ms = 350) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      const ok = await sincronizar();
      if (!ok) programar(1500);
      else if (tareas(sincronizadoRef.current, mapaActual()).length > 0) programar(60);
    }, ms);
  }

  async function flush(): Promise<boolean> {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    let vueltas = 0;
    while (guardandoRef.current || tareas(sincronizadoRef.current, mapaActual()).length > 0) {
      if (guardandoRef.current) await esperar(30);
      else if (!(await sincronizar())) return false;
      if (++vueltas > 200) return false;
    }
    return true;
  }

  function ajustar(platoId: string | null, descripcion: string, precio: number, delta: number) {
    setError(null);
    const key = claveDe(platoId, descripcion, precio);
    const prev = lineasRef.current;
    const i = prev.findIndex((l) => l.key === key);
    let next: LineaLocal[];
    if (i === -1) {
      if (delta <= 0) return;
      next = [...prev, { key, platoId, descripcion, precio, cantidad: delta, nota: null }];
    } else {
      const cantidad = prev[i].cantidad + delta;
      next = cantidad <= 0 ? prev.filter((_, j) => j !== i) : prev.map((l, j) => (j === i ? { ...l, cantidad } : l));
    }
    lineasRef.current = next;
    setLineas(next);
    programar();
  }

  // ── Cocina: qué saldría en el próximo pase ──
  const bebidaIds = useMemo(() => new Set(platos.filter((p) => p.tipo === "bebida").map((p) => p.id)), [platos]);
  const pendienteCocina = useMemo(() => {
    let nuevos = 0;
    let quitar = 0;
    const vivos = new Map(lineas.map((l) => [l.key, l] as const));
    for (const l of lineas) {
      if (l.platoId && bebidaIds.has(l.platoId)) continue;
      const env = enviadosRef.current.get(l.key) ?? 0;
      if (l.cantidad > env) nuevos += l.cantidad - env;
      else if (l.cantidad < env) quitar += env - l.cantidad;
    }
    for (const [key, env] of enviadosRef.current) if (env > 0 && !vivos.has(key)) quitar += env;
    return { nuevos, quitar, hay: nuevos > 0 || quitar > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, bebidaIds, pases]);

  async function enviarCocina() {
    if (enviando) return;
    setError(null);
    setEnviando(true);
    try {
      if (!(await flush())) return;
      const res = await enviarACocina(ticket.id);
      if (!res.ok) {
        setError(res.error ?? "No se pudo enviar a cocina");
        return;
      }
      enviadosRef.current = new Map(
        lineasRef.current.filter((l) => l.cantidad > 0).map((l) => [l.key, l.cantidad] as const),
      );
      setPases((p) => p + 1);
      if (navigator.vibrate) navigator.vibrate(80); // confirmación táctil
    } finally {
      setEnviando(false);
    }
  }

  function cambiarNota(key: string, nota: string) {
    const next = lineasRef.current.map((l) => (l.key === key ? { ...l, nota: nota || null } : l));
    lineasRef.current = next;
    setLineas(next);
  }
  async function guardarNota(l: LineaLocal) {
    if (!(await flush())) return;
    const res = await fijarNotaLinea(
      ticket.id,
      l.platoId ? { platoId: l.platoId } : { descripcion: l.descripcion, precio: l.precio },
      l.nota ?? "",
    );
    if (!res.ok) setError(res.error ?? "No se pudo guardar la nota");
  }

  function anadirLibre() {
    const desc = libreDesc.trim();
    const precio = parseFloat(librePrecio.replace(",", "."));
    if (!desc || !Number.isFinite(precio) || precio < 0) return;
    ajustar(null, desc, precio, 1);
    setLibreDesc("");
    setLibrePrecio("");
  }

  async function volver() {
    await flush();
    router.push("/tpv/comandero");
  }

  // ── Carta por categorías (chips) ──
  const categorias = useMemo<Categoria[]>(() => {
    const conPvp = platos.filter((p) => p.pvp !== null);
    const grupos: Categoria[] = [
      { id: "platos", etiqueta: "Platos", platos: conPvp.filter((p) => p.tipo !== "bebida" && p.tipo !== "postre") },
      { id: "postres", etiqueta: "Postres", platos: conPvp.filter((p) => p.tipo === "postre") },
      { id: "bebidas", etiqueta: "Bebidas", platos: conPvp.filter((p) => p.tipo === "bebida") },
    ];
    return grupos.filter((g) => g.platos.length > 0);
  }, [platos]);
  const [catActiva, setCatActiva] = useState(0);
  const cantidadDe = (p: PlatoTpv) => lineas.find((l) => l.key === claveDe(p.id, p.nombre, p.pvp ?? 0))?.cantidad ?? 0;

  return (
    <section className="anim-in mx-auto max-w-lg pb-28">
      {/* ── Cabecera ── */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          onClick={volver}
          className="flex cursor-pointer items-center gap-1 rounded-xl px-2.5 py-2 text-[14px] font-semibold text-ink-soft active:bg-chip"
        >
          <ArrowLeft className="size-4.5" /> Mesas
        </button>
        <h1 className="font-display min-w-0 flex-1 truncate text-center text-lg font-bold tracking-tight">
          {ticket.mesaNombre}
        </h1>
        <div className="flex items-center gap-1 rounded-full border border-line bg-card px-1.5 py-1">
          <Users className="size-3.5 text-ink-soft" />
          <button
            onClick={() =>
              startAccion(async () => {
                await cambiarComensales(ticket.id, Math.max(1, (ticket.comensales ?? 1) - 1));
                router.refresh();
              })
            }
            className="grid size-6 cursor-pointer place-items-center rounded-full active:bg-chip"
            aria-label="Menos comensales"
          >
            <Minus className="size-3" />
          </button>
          <b className="w-4 text-center font-display text-[14px]">{ticket.comensales ?? "—"}</b>
          <button
            onClick={() =>
              startAccion(async () => {
                await cambiarComensales(ticket.id, (ticket.comensales ?? 0) + 1);
                router.refresh();
              })
            }
            className="grid size-6 cursor-pointer place-items-center rounded-full active:bg-chip"
            aria-label="Más comensales"
          >
            <Plus className="size-3" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">{error}</div>
      )}

      {/* ── Chips de categoría ── */}
      <div className="sticky top-0 z-20 -mx-1 mb-3 flex gap-1.5 overflow-x-auto bg-paper px-1 py-2">
        {categorias.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setCatActiva(i)}
            className={cn(
              "shrink-0 cursor-pointer rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors",
              i === catActiva ? "bg-ink text-white" : "border border-line bg-card text-ink-soft",
            )}
          >
            {c.etiqueta}
          </button>
        ))}
      </div>

      {/* ── Carta en grande ── */}
      <div className="grid grid-cols-2 gap-2">
        {(categorias[catActiva]?.platos ?? []).map((p) => {
          const n = cantidadDe(p);
          return (
            <button
              key={p.id}
              onClick={() => ajustar(p.id, p.nombre, p.pvp ?? 0, 1)}
              className={cn(
                "relative flex min-h-25 cursor-pointer flex-col items-start justify-between rounded-2xl border-2 p-3 text-left transition-all active:scale-95",
                n > 0 ? "border-brand bg-brand-soft" : "border-line bg-card",
              )}
            >
              {n > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid min-w-6 place-items-center rounded-full bg-brand px-1.5 py-0.5 font-display text-[13px] font-bold text-white shadow">
                  {n}
                </span>
              )}
              <span className="text-[26px] leading-none">{p.emoji}</span>
              <span className="mt-1 line-clamp-2 text-[13.5px] leading-tight font-bold">{p.nombre}</span>
              <span className="font-display text-[12.5px] font-bold text-ink-soft">{eur(p.pvp ?? 0)}</span>
            </button>
          );
        })}
      </div>

      {/* ── Hoja inferior: la comanda ── */}
      {hojaAbierta && (
        <>
          <div className="fixed inset-0 z-40 bg-black/45" onClick={() => setHojaAbierta(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[78svh] flex-col rounded-t-3xl bg-paper shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <b className="font-display text-[15px] font-bold">
                Comanda · {unidades} {unidades === 1 ? "ud" : "uds"}
              </b>
              <button
                onClick={() => setHojaAbierta(false)}
                className="grid size-8 cursor-pointer place-items-center rounded-full active:bg-chip"
                aria-label="Cerrar comanda"
              >
                <X className="size-4.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {lineas.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-ink-soft">Aún no hay nada — toca platos de la carta</p>
              )}
              {lineas.map((l) => (
                <div key={l.key} className="border-b border-line px-3.5 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => ajustar(l.platoId, l.descripcion, l.precio, -1)}
                      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line active:bg-chip"
                      aria-label={`Quitar ${l.descripcion}`}
                    >
                      <Minus className="size-4" />
                    </button>
                    <b className="w-6 shrink-0 text-center font-display text-[15px]">{l.cantidad}</b>
                    <button
                      onClick={() => ajustar(l.platoId, l.descripcion, l.precio, 1)}
                      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line active:bg-chip"
                      aria-label={`Añadir ${l.descripcion}`}
                    >
                      <Plus className="size-4" />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                      {l.descripcion}
                      {l.nota && notaAbierta !== l.key && (
                        <span className="block truncate text-[12px] font-semibold text-brand">→ {l.nota}</span>
                      )}
                    </span>
                    <button
                      onClick={() => setNotaAbierta(notaAbierta === l.key ? null : l.key)}
                      className={cn(
                        "grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg",
                        l.nota || notaAbierta === l.key ? "bg-brand-soft text-brand" : "text-ink-soft active:bg-chip",
                      )}
                      aria-label={`Nota para ${l.descripcion}`}
                    >
                      <NotebookPen className="size-4" />
                    </button>
                    <span className="shrink-0 font-display text-[14px] font-bold">{eur(l.precio * l.cantidad)}</span>
                  </div>
                  {notaAbierta === l.key && (
                    <input
                      autoFocus
                      value={l.nota ?? ""}
                      placeholder="Sin cebolla, poco hecho…"
                      onChange={(e) => cambiarNota(l.key, e.target.value)}
                      onBlur={() => {
                        setNotaAbierta(null);
                        void guardarNota(lineasRef.current.find((x) => x.key === l.key) ?? l);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="mt-1.5 w-full rounded-lg border border-brand/40 bg-brand-soft/40 px-3 py-2 text-[14px] outline-none focus:border-brand"
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-2 px-3.5 py-3">
                <input
                  placeholder="Fuera de carta…"
                  value={libreDesc}
                  onChange={(e) => setLibreDesc(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="€"
                  value={librePrecio}
                  onChange={(e) => setLibrePrecio(e.target.value)}
                  className="w-16 rounded-lg border border-line bg-card px-2 py-2 text-sm outline-none focus:border-brand"
                />
                <button
                  onClick={anadirLibre}
                  disabled={!libreDesc.trim() || !librePrecio}
                  className="cursor-pointer rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex items-baseline justify-between border-t-2 border-ink px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <span className="text-[12.5px] font-bold tracking-wider text-ink-soft uppercase">Total</span>
              <b className="font-display text-2xl font-bold tracking-tight">{eur(total)}</b>
            </div>
          </div>
        </>
      )}

      {/* ── Barra fija inferior ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-paper/95 px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <button
          onClick={() => setHojaAbierta(true)}
          className="flex min-h-13 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-bold text-white active:opacity-85"
        >
          <ReceiptText className="size-4.5" />
          {unidades > 0 ? `${unidades} · ${eur(total)}` : "Comanda"}
        </button>
        <button
          onClick={enviarCocina}
          disabled={!pendienteCocina.hay || enviando}
          className={cn(
            "flex min-h-13 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white active:opacity-85 disabled:opacity-45",
            pendienteCocina.quitar > 0 && pendienteCocina.nuevos === 0 ? "bg-bad" : "bg-brand",
          )}
        >
          <Flame className="size-4.5" />
          {enviando
            ? "Enviando…"
            : pendienteCocina.nuevos > 0
              ? `Enviar · ${pendienteCocina.nuevos}`
              : pendienteCocina.quitar > 0
                ? `Avisar quitar ${pendienteCocina.quitar}`
                : pases > 0
                  ? "Enviado ✓"
                  : "Enviar"}
        </button>
      </div>
    </section>
  );
}
