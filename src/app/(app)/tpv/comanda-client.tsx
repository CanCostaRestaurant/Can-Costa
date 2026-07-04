"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, CreditCard, Minus, Plus, Users, X } from "lucide-react";
import { type PlatoTpv, type TicketDetalle } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { anularTicket, cambiarComensales, eliminarPago, registrarPago } from "./actions";
import { fijarLinea } from "./comanda-actions";

// Bebidas y extras de un toque (línea libre, sin escandallo).
const EXTRAS_RAPIDOS: { nombre: string; precio: number }[] = [
  { nombre: "Copa de vino", precio: 3.5 },
  { nombre: "Caña", precio: 2.8 },
  { nombre: "Refresco", precio: 2.5 },
  { nombre: "Agua", precio: 2.2 },
  { nombre: "Café", precio: 1.6 },
  { nombre: "Postre del día", precio: 5.5 },
];

// Línea de la comanda en estado local: fuente de verdad mientras se edita, para
// que cada toque sea instantáneo. La BD se sincroniza en segundo plano.
type LineaLocal = {
  key: string;
  platoId: string | null;
  descripcion: string;
  precio: number;
  cantidad: number;
};

// Identidad estable de una línea: por plato, o por descripción+precio si es libre.
const claveDe = (platoId: string | null, descripcion: string, precio: number) =>
  platoId ? `p:${platoId}` : `l:${descripcion}|${precio.toFixed(2)}`;

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Redondeo por línea (como en BD) antes de sumar, para cuadrar al céntimo.
const totalLineas = (ls: LineaLocal[]) =>
  ls.reduce((a, l) => a + Math.round(l.precio * l.cantidad * 100) / 100, 0);

const aLocal = (l: TicketDetalle["lineas"][number]): LineaLocal => ({
  key: claveDe(l.platoId, l.descripcion, l.precioUnitario),
  platoId: l.platoId,
  descripcion: l.descripcion,
  precio: l.precioUnitario,
  cantidad: l.cantidad,
});

export function ComandaClient({ ticket, platos }: { ticket: TicketDetalle; platos: PlatoTpv[] }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmarAnular, setConfirmarAnular] = useState(false);
  const [libreDesc, setLibreDesc] = useState("");
  const [librePrecio, setLibrePrecio] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // ── Comanda: estado local (instantáneo) + sincronización en segundo plano ──
  const [lineas, setLineas] = useState<LineaLocal[]>(() => ticket.lineas.map(aLocal));
  const lineasRef = useRef(lineas); // la última versión, para el sync
  const sincronizadoRef = useRef(
    new Map(ticket.lineas.map((l) => [claveDe(l.platoId, l.descripcion, l.precioUnitario), aLocal(l)] as const)),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardandoRef = useRef(false);

  const total = useMemo(() => totalLineas(lineas), [lineas]);
  const restante = Math.round((total - ticket.pagado) * 100) / 100;

  // Acciones que sí deben esperar al servidor (comensales, pagos, anular).
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

  const mapaActual = () => new Map(lineasRef.current.map((l) => [l.key, { ...l }] as const));

  // Qué líneas cambiaron entre lo ya guardado y lo actual (incluye borrados → 0).
  function tareas(previo: Map<string, LineaLocal>, actual: Map<string, LineaLocal>) {
    const t: { linea: LineaLocal; cantidad: number }[] = [];
    for (const [key, l] of actual) if (previo.get(key)?.cantidad !== l.cantidad) t.push({ linea: l, cantidad: l.cantidad });
    for (const [key, l] of previo) if (!actual.has(key)) t.push({ linea: l, cantidad: 0 });
    return t;
  }

  async function sincronizar(): Promise<boolean> {
    if (guardandoRef.current) return true;
    const actual = mapaActual();
    const pendientes = tareas(sincronizadoRef.current, actual);
    if (pendientes.length === 0) return true;
    guardandoRef.current = true;
    setGuardando(true);
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
      setGuardando(false);
    }
  }

  function programar(ms = 350) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      const ok = await sincronizar();
      if (!ok) programar(1500); // reintenta si la BD falló
      else if (tareas(sincronizadoRef.current, mapaActual()).length > 0) programar(60); // drena lo tocado mientras guardaba
    }, ms);
  }

  // Vuelca a la BD todo lo pendiente y espera (antes de cobrar o de salir).
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

  // Ajusta la cantidad de una línea en local y agenda el guardado. Instantáneo.
  function ajustar(platoId: string | null, descripcion: string, precio: number, delta: number) {
    setError(null);
    const key = claveDe(platoId, descripcion, precio);
    const prev = lineasRef.current;
    const i = prev.findIndex((l) => l.key === key);
    let next: LineaLocal[];
    if (i === -1) {
      if (delta <= 0) return;
      next = [...prev, { key, platoId, descripcion, precio, cantidad: delta }];
    } else {
      const cantidad = prev[i].cantidad + delta;
      next = cantidad <= 0 ? prev.filter((_, j) => j !== i) : prev.map((l, j) => (j === i ? { ...l, cantidad } : l));
    }
    lineasRef.current = next;
    setLineas(next);
    programar();
  }

  function anadirPlato(p: PlatoTpv) {
    if (p.pvp === null) {
      setError(`"${p.nombre}" no tiene PVP — ponlo en Escandallos`);
      return;
    }
    ajustar(p.id, p.nombre, p.pvp, 1);
  }

  function anadirLibre() {
    const desc = libreDesc.trim();
    const precio = parseFloat(librePrecio.replace(",", "."));
    if (!desc || !Number.isFinite(precio) || precio < 0) return;
    ajustar(null, desc, precio, 1);
    setLibreDesc("");
    setLibrePrecio("");
  }

  // Antes de abrir el cobro: persistir líneas y refrescar para que el panel de
  // cobro (que lee restante/pagos del servidor) vea los importes correctos.
  async function irACobrar() {
    if (!(await flush())) return;
    router.refresh();
    setCobrando(true);
  }

  async function volver() {
    await flush();
    router.push("/tpv");
  }

  return (
    <section className="anim-in">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={volver}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[14px] font-semibold text-ink-soft transition-colors hover:bg-chip hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Mesas
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight">{ticket.mesaNombre}</h1>
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-card px-2 py-1">
          <Users className="size-4 text-ink-soft" />
          <button
            onClick={() => ejecutar(() => cambiarComensales(ticket.id, Math.max(1, (ticket.comensales ?? 1) - 1)))}
            className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-chip"
            aria-label="Menos comensales"
          >
            <Minus className="size-3.5" />
          </button>
          <b className="w-5 text-center font-display text-[15px]">{ticket.comensales ?? "—"}</b>
          <button
            onClick={() => ejecutar(() => cambiarComensales(ticket.id, (ticket.comensales ?? 0) + 1))}
            className="grid size-7 cursor-pointer place-items-center rounded-full hover:bg-chip"
            aria-label="Más comensales"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[1fr_1.2fr] items-start gap-3.5 max-md:grid-cols-1">
        {/* ── Ticket ── */}
        <div className="card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Comanda</span>
            <span
              className={cn(
                "text-[11px] font-semibold text-ink-soft transition-opacity",
                guardando ? "opacity-70" : "opacity-0",
              )}
            >
              guardando…
            </span>
          </div>
          <div className="min-h-[220px] flex-1">
            {lineas.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">
                Toca los platos de la derecha para añadirlos
              </p>
            )}
            {lineas.map((l) => (
              <div key={l.key} className="flex items-center gap-2 border-b border-line px-3 py-2">
                <button
                  onClick={() => ajustar(l.platoId, l.descripcion, l.precio, -1)}
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line hover:bg-chip active:scale-95"
                  aria-label={`Quitar ${l.descripcion}`}
                >
                  <Minus className="size-4" />
                </button>
                <b className="w-6 shrink-0 text-center font-display text-[15px]">{l.cantidad}</b>
                <button
                  onClick={() => ajustar(l.platoId, l.descripcion, l.precio, 1)}
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line hover:bg-chip active:scale-95"
                  aria-label={`Añadir ${l.descripcion}`}
                >
                  <Plus className="size-4" />
                </button>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{l.descripcion}</span>
                <span className="shrink-0 font-display text-[14.5px] font-bold">{eur(l.precio * l.cantidad)}</span>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-ink px-4 py-3">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[13px] font-semibold tracking-wider text-ink-soft uppercase">Total</span>
              <b className="font-display text-3xl font-bold tracking-tight">{eur(total)}</b>
            </div>

            {/* Pagos parciales ya registrados */}
            {ticket.pagos.length > 0 && (
              <div className="mb-2 rounded-xl bg-chip px-3 py-2">
                {ticket.pagos.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-0.5 text-[13px]">
                    {p.metodo === "efectivo" ? (
                      <Banknote className="size-3.5 text-good" />
                    ) : (
                      <CreditCard className="size-3.5 text-ink-soft" />
                    )}
                    <span className="flex-1 text-ink-soft">{p.metodo === "efectivo" ? "Efectivo" : "Tarjeta"}</span>
                    <b className="font-display font-bold">{eur(p.importe)}</b>
                    <button
                      onClick={() => ejecutar(() => eliminarPago(p.id, ticket.id))}
                      title="Deshacer este pago"
                      className="cursor-pointer rounded p-0.5 text-ink-soft hover:bg-bad-soft hover:text-bad"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-[13px] font-semibold">
                  <span>Queda por pagar</span>
                  <b className="font-display text-[15px] font-bold text-brand">{eur(restante)}</b>
                </div>
              </div>
            )}

            <button
              onClick={irACobrar}
              disabled={lineas.length === 0 || restante <= 0}
              className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-good text-[16px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Cobrar {eur(restante)}
            </button>
            <button
              onClick={() => {
                if (!confirmarAnular) {
                  setConfirmarAnular(true);
                  setTimeout(() => setConfirmarAnular(false), 4000);
                  return;
                }
                ejecutar(() => anularTicket(ticket.id), () => router.push("/tpv"));
              }}
              disabled={ocupado}
              className={cn(
                "mt-2 w-full cursor-pointer rounded-xl border px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50",
                confirmarAnular
                  ? "border-bad bg-bad text-white"
                  : "border-line text-ink-soft hover:border-bad hover:text-bad",
              )}
            >
              {confirmarAnular ? "¿Seguro? Anular ticket" : "Anular ticket"}
            </button>
          </div>
        </div>

        {/* ── Carta ── */}
        <div className="flex flex-col gap-3.5">
          <div className="card p-4">
            <h3 className="mb-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">Platos</h3>
            <div className="grid grid-cols-3 gap-2 max-lg:grid-cols-2">
              {platos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => anadirPlato(p)}
                  className="flex min-h-20 cursor-pointer flex-col items-start justify-between rounded-xl border border-line bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand active:scale-[0.98]"
                >
                  <span className="text-xl">{p.emoji}</span>
                  <span className="text-[13px] leading-tight font-semibold">{p.nombre}</span>
                  <span className="font-display text-[13px] font-bold text-ink-soft">
                    {p.pvp !== null ? eur(p.pvp) : "sin PVP"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Bebidas y extras
            </h3>
            <div className="grid grid-cols-3 gap-2 max-lg:grid-cols-2">
              {EXTRAS_RAPIDOS.map((e) => (
                <button
                  key={e.nombre}
                  onClick={() => ajustar(null, e.nombre, e.precio, 1)}
                  className="flex min-h-13 cursor-pointer items-center justify-between rounded-xl border border-line bg-card px-3 py-2 transition-all hover:border-brand active:scale-[0.98]"
                >
                  <span className="text-[13px] font-semibold">{e.nombre}</span>
                  <span className="font-display text-[13px] font-bold text-ink-soft">{eur(e.precio)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <input
                placeholder="Línea libre…"
                value={libreDesc}
                onChange={(e) => setLibreDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && anadirLibre()}
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="€"
                value={librePrecio}
                onChange={(e) => setLibrePrecio(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && anadirLibre()}
                className="w-20 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={anadirLibre}
                disabled={!libreDesc.trim() || !librePrecio}
                className="cursor-pointer rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
              >
                Añadir
              </button>
            </div>
          </div>
        </div>
      </div>

      {cobrando && (
        <PanelCobro
          ticket={ticket}
          onCerrar={() => setCobrando(false)}
          onCobrado={(id) => router.push(`/tpv/recibo/${id}?cobrado=1`)}
          onRefrescar={() => router.refresh()}
        />
      )}
    </section>
  );
}

// ── Panel de cobro: todo de una vez o por partes (grupos), efectivo con
// cambio o tarjeta. El ticket se cierra cuando la suma de pagos llega. ──
function PanelCobro({
  ticket,
  onCerrar,
  onCobrado,
  onRefrescar,
}: {
  ticket: TicketDetalle;
  onCerrar: () => void;
  onCobrado: (id: string) => void; // ticket pagado del todo → ir al recibo
  onRefrescar: () => void;
}) {
  const [cobrando, startCobro] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null);

  const restante = ticket.restante;
  const [importeTxt, setImporteTxt] = useState(String(restante));
  const [entregadoTxt, setEntregadoTxt] = useState("");
  const [partes, setPartes] = useState(Math.max(2, ticket.comensales ?? 2));

  // Si el restante cambia (se registró un pago parcial), recargar el importe.
  // Patrón de React "ajustar estado durante el render" (sin efecto).
  const [restantePrevio, setRestantePrevio] = useState(restante);
  if (restantePrevio !== restante) {
    setRestantePrevio(restante);
    setImporteTxt(String(restante));
    setEntregadoTxt("");
  }

  const importe = Math.min(parseFloat(importeTxt.replace(",", ".")) || 0, restante);
  const esParcial = importe > 0 && importe < restante - 0.001;
  const porParte = Math.ceil((restante / Math.max(1, partes)) * 100) / 100;

  // Importes sugeridos de efectivo: justos + los billetes que superan el importe.
  const sugerencias = useMemo(() => {
    const notas = [5, 10, 20, 50, 100].filter((n) => n > importe);
    return [Math.round(importe * 100) / 100, ...notas].slice(0, 4);
  }, [importe]);

  const entregado = parseFloat(entregadoTxt.replace(",", ".")) || 0;
  const cambio = entregado >= importe && importe > 0 ? entregado - importe : null;

  function cobrar(metodo: "efectivo" | "tarjeta") {
    if (importe <= 0) {
      setError("Pon el importe a cobrar");
      return;
    }
    setError(null);
    setAvisoParcial(null);
    startCobro(async () => {
      const res = await registrarPago(ticket.id, {
        metodo,
        importe,
        entregado: metodo === "efectivo" && entregado > 0 ? entregado : undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo cobrar");
        return;
      }
      if (res.cerrado) {
        // Pagado del todo → al recibo (que muestra "Cobrado", cambio y pagos).
        // No refrescamos la comanda: la server action ya revalidó /tpv.
        onCobrado(ticket.id);
      } else {
        const trozos = [`✓ ${eur(importe)} en ${metodo} registrado`];
        if (metodo === "efectivo" && cambio !== null && cambio > 0) trozos.push(`cambio ${eur(cambio)}`);
        trozos.push(`quedan ${eur(res.restante ?? 0)}`);
        setAvisoParcial(trozos.join(" · "));
        onRefrescar(); // pago parcial: refrescar la comanda para ver el restante
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 max-md:p-0 md:items-center"
      onClick={cobrando ? undefined : onCerrar}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-5 shadow-2xl max-md:rounded-b-none"
        onClick={(e) => e.stopPropagation()}
      >
        {
          // ── Cobro (total o por partes) ──
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-wider text-ink-soft uppercase">A cobrar</span>
              <button
                onClick={onCerrar}
                className="cursor-pointer rounded-lg p-1.5 text-ink-soft hover:bg-chip hover:text-ink"
                aria-label="Cerrar"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mb-1 text-center font-display text-[40px] font-bold tracking-tight">
              {eur(restante)}
            </div>
            {ticket.pagado > 0 && (
              <div className="mb-2 text-center text-[12.5px] font-semibold text-ink-soft">
                ya pagados {eur(ticket.pagado)} de {eur(ticket.total)}
              </div>
            )}

            {avisoParcial && (
              <div className="mb-3 rounded-xl bg-good-soft px-3.5 py-2.5 text-[13px] font-semibold text-good">
                {avisoParcial}
              </div>
            )}
            {error && (
              <div className="mb-3 rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">
                {error}
              </div>
            )}

            {/* Cuánto cobrar ahora: todo, o una parte (grupos) */}
            <div className="mb-3 rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold">Cuánto cobro ahora</span>
                <span className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                  dividir entre
                  <button
                    onClick={() => setPartes((p) => Math.max(2, p - 1))}
                    className="grid size-7 cursor-pointer place-items-center rounded-lg border border-line hover:bg-chip"
                    aria-label="Menos partes"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <b className="w-5 text-center font-display text-[14px] text-ink">{partes}</b>
                  <button
                    onClick={() => setPartes((p) => Math.min(40, p + 1))}
                    className="grid size-7 cursor-pointer place-items-center rounded-lg border border-line hover:bg-chip"
                    aria-label="Más partes"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </span>
              </div>
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                <BotonImporte
                  activo={!esParcial && importe > 0}
                  onClick={() => setImporteTxt(String(restante))}
                >
                  Todo · {eur(restante, false)}
                </BotonImporte>
                <BotonImporte
                  activo={esParcial && Math.abs(importe - Math.ceil((restante / 2) * 100) / 100) < 0.005}
                  onClick={() => setImporteTxt(String(Math.ceil((restante / 2) * 100) / 100))}
                >
                  Mitad
                </BotonImporte>
                <BotonImporte
                  activo={esParcial && Math.abs(importe - porParte) < 0.005}
                  onClick={() => setImporteTxt(String(Math.min(porParte, restante)))}
                >
                  1/{partes} · {eur(Math.min(porParte, restante), false)}
                </BotonImporte>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  inputMode="decimal"
                  value={importeTxt}
                  onChange={(e) => setImporteTxt(e.target.value)}
                  className="w-28 rounded-lg border border-line bg-card px-2.5 py-2 font-display text-[17px] font-bold outline-none focus:border-brand"
                  aria-label="Importe a cobrar"
                />
                <span className="font-display text-[15px] font-bold text-ink-soft">€</span>
                {esParcial && (
                  <span className="ml-auto rounded-full bg-brand/10 px-2.5 py-1 text-[11.5px] font-bold text-brand">
                    pago parcial · quedarán {eur(restante - importe)}
                  </span>
                )}
              </div>
            </div>

            {/* Efectivo con cambio */}
            <div className="mb-3 rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                <Banknote className="size-4 text-good" /> Efectivo
              </div>
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {sugerencias.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    onClick={() => setEntregadoTxt(String(s))}
                    className={cn(
                      "cursor-pointer rounded-lg border py-2 text-[13px] font-semibold transition-colors",
                      entregado === s ? "border-good bg-good-soft text-good" : "border-line hover:border-good",
                    )}
                  >
                    {i === 0 ? "Justos" : eur(s, false)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  inputMode="decimal"
                  placeholder="me entregan…"
                  value={entregadoTxt}
                  onChange={(e) => setEntregadoTxt(e.target.value)}
                  className="w-32 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                />
                {cambio !== null && cambio > 0 && (
                  <span className="ml-auto text-[13px]">
                    Cambio <b className="font-display text-[17px] font-bold">{eur(cambio)}</b>
                  </span>
                )}
              </div>
              <button
                onClick={() => cobrar("efectivo")}
                disabled={cobrando || importe <= 0}
                className="mt-2.5 flex min-h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-good text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Banknote className="size-5" /> Cobrar {eur(importe)} en efectivo
              </button>
            </div>

            {/* Tarjeta */}
            <button
              onClick={() => cobrar("tarjeta")}
              disabled={cobrando || importe <= 0}
              className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              <CreditCard className="size-5" /> Cobrar {eur(importe)} con tarjeta
            </button>
            <p className="mt-2 text-center text-[11.5px] text-ink-soft">
              Con tarjeta: pasa {eur(importe)} por el datáfono y confirma aquí.
            </p>
          </>
        }
      </div>
    </div>
  );
}

function BotonImporte({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg border py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
        activo ? "border-brand bg-brand-soft text-brand" : "border-line hover:border-brand",
      )}
    >
      {children}
    </button>
  );
}
