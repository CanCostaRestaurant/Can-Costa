"use client";

// Caja del día dentro de Ventas: retiradas de efectivo + cierre de caja
// (cuadre del cajón y del datáfono contra lo que dice el TPV). Antes vivía en
// /tpv/cierre; ahora se cierra desde aquí, donde ya ves las ventas del día.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Calculator, CreditCard, Lock, Minus, Plus, TriangleAlert, X } from "lucide-react";
import { Chip } from "@/components/ui";
import { type CierreDia } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { cerrarCaja, crearRetirada, eliminarRetirada } from "../tpv/cierre/actions";

// Denominaciones de euro en céntimos (evita líos de coma flotante al sumar).
const BILLETES = [50000, 20000, 10000, 5000, 2000, 1000, 500] as const;
const MONEDAS = [200, 100, 50, 20, 10, 5, 2, 1] as const;

function etiquetaDenom(c: number): string {
  return c >= 100 ? `${c / 100} €` : `${c} c`;
}

export function CajaDelDia({ datos }: { datos: CierreDia }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  const c = datos.cierre;
  const [contadoTxt, setContadoTxt] = useState(c ? String(c.efectivoContado) : "");
  const [datafonoTxt, setDatafonoTxt] = useState(c ? String(c.datafono) : "");
  const [fondoTxt, setFondoTxt] = useState(c ? String(c.fondoSiguiente) : String(datos.fondoAnterior));
  const [notas, setNotas] = useState(c?.notas ?? "");

  // Retiradas
  const [retImporte, setRetImporte] = useState("");
  const [retMotivo, setRetMotivo] = useState("");

  // Contador de billetes y monedas (rellena el efectivo contado)
  const [contadorAbierto, setContadorAbierto] = useState(false);
  const [conteo, setConteo] = useState<Record<number, number>>({});

  function setDenom(c: number, cantidad: number) {
    const n = { ...conteo, [c]: Math.max(0, Math.floor(cantidad) || 0) };
    setConteo(n);
    const totalCent = [...BILLETES, ...MONEDAS].reduce((acc, d) => acc + d * (n[d] || 0), 0);
    setContadoTxt((totalCent / 100).toFixed(2));
  }

  const contado = parseFloat(contadoTxt.replace(",", ".")) || 0;
  const datafono = parseFloat(datafonoTxt.replace(",", ".")) || 0;
  const fondoSig = parseFloat(fondoTxt.replace(",", ".")) || 0;

  // Cajón esperado = fondo de apertura + ventas efectivo − retiradas del día.
  const cajonEsperado = datos.fondoAnterior + datos.efectivoEsperado - datos.retiradasTotal;
  const difEfectivo = contado - cajonEsperado;
  const difTarjeta = datafono - datos.tarjetaEsperada;
  const cuadraEfectivo = Math.abs(difEfectivo) < 0.005;
  const cuadraTarjeta = Math.abs(difTarjeta) < 0.005;

  const mostrandoResumen = c !== null && !editando;

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>, alGuardar?: () => void) {
    setError(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      alGuardar?.();
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-[1.5fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
      {/* ── Cierre ── */}
      <div className="card p-5.5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
            {mostrandoResumen ? <Lock className="size-4.5 text-ink-soft" /> : <Banknote className="size-4.5 text-ink-soft" />}
            {mostrandoResumen ? "Caja cerrada" : "Cerrar la caja del día"}
          </h3>
          {mostrandoResumen && (
            <span className="text-[12px] text-ink-soft">
              {c!.cerradoPor ? `por ${c!.cerradoPor} · ` : ""}a las {c!.actualizado}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13px] font-semibold text-bad">{error}</div>
        )}

        {/* Lo que dice el TPV */}
        <div className="mb-4 grid grid-cols-2 gap-2.5">
          <MiniKpi
            etiqueta="Efectivo esperado en cajón"
            valor={eur(cajonEsperado)}
            detalle={`fondo ${eur(datos.fondoAnterior, false)} + ventas ${eur(datos.efectivoEsperado, false)}${datos.retiradasTotal > 0 ? ` − retiradas ${eur(datos.retiradasTotal, false)}` : ""}`}
          />
          <MiniKpi etiqueta="Tarjeta esperada" valor={eur(datos.tarjetaEsperada)} detalle="debe salir en el datáfono" />
        </div>

        {datos.ticketsAbiertos.length > 0 && (
          <div className="mb-3.5 rounded-[14px] border border-warn bg-warn-soft px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-bold text-[#7A5106]">
              <TriangleAlert className="size-4 text-warn" />
              {datos.ticketsAbiertos.length} mesa(s) sin cobrar — ciérralas antes
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {datos.ticketsAbiertos.map((t) => (
                <Link
                  key={t.id}
                  href={`/tpv?ticket=${t.id}`}
                  className="rounded-full border border-[#EED9AC] bg-card px-2.5 py-1 text-[12.5px] font-semibold hover:border-warn"
                >
                  {t.mesa} · {eur(t.total)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {mostrandoResumen ? (
          <>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <Cuadre icono={<Banknote className="size-4" />} titulo="Efectivo" contado={c!.efectivoContado} esperado={c!.fondoAnterior + c!.efectivoEsperado - c!.retiradas} />
              <Cuadre icono={<CreditCard className="size-4" />} titulo="Datáfono" contado={c!.datafono} esperado={c!.tarjetaEsperada} />
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-chip px-4 py-2.5 text-[13px]">
              <span className="text-ink-soft">Fondo que queda para mañana</span>
              <b className="font-display text-[15px] font-bold">{eur(c!.fondoSiguiente)}</b>
            </div>
            {c!.notas && <p className="mt-3 rounded-xl border border-line px-4 py-2.5 text-[13px] text-ink-soft">{c!.notas}</p>}
            <button
              onClick={() => setEditando(true)}
              className="mt-3.5 cursor-pointer rounded-xl border border-line px-4 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-[#CFC6B4] hover:text-ink"
            >
              Rehacer el cierre
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
              <Campo etiqueta="Efectivo contado en el cajón" detalle="todo lo que hay, incluido el fondo" valor={contadoTxt} onCambio={setContadoTxt}>
                <button
                  type="button"
                  onClick={() => setContadorAbierto((v) => !v)}
                  title="Contar billetes y monedas"
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors",
                    contadorAbierto ? "border-brand bg-brand-soft text-brand" : "border-line text-ink-soft hover:border-brand hover:text-ink",
                  )}
                >
                  <Calculator className="size-3.5" /> Contar
                </button>
                {contadoTxt !== "" && !contadorAbierto && <Diferencia dif={difEfectivo} cuadra={cuadraEfectivo} />}
              </Campo>
              <Campo etiqueta="Total del cierre del datáfono" detalle="haz el cierre y copia el total" valor={datafonoTxt} onCambio={setDatafonoTxt}>
                {datafonoTxt !== "" && <Diferencia dif={difTarjeta} cuadra={cuadraTarjeta} />}
              </Campo>
              <Campo etiqueta="Fondo que dejas para mañana" detalle="cambio que se queda en el cajón" valor={fondoTxt} onCambio={setFondoTxt} />
              <label className="block text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
                Notas
                <input
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="incidencias, propinas…"
                  className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2.5 font-body text-[14px] font-normal tracking-normal outline-none focus:border-brand"
                />
              </label>
            </div>

            {contadorAbierto && (
              <ContadorEfectivo
                conteo={conteo}
                onDenom={setDenom}
                total={contado}
                dif={difEfectivo}
                cuadra={cuadraEfectivo}
                onVaciar={() => {
                  setConteo({});
                  setContadoTxt("");
                }}
              />
            )}

            {contadoTxt !== "" && datafonoTxt !== "" && (
              <div className={cn("mt-3.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold", cuadraEfectivo && cuadraTarjeta ? "bg-good-soft text-good" : "bg-warn-soft text-[#7A5106]")}>
                {cuadraEfectivo && cuadraTarjeta
                  ? "✓ Todo cuadra al céntimo"
                  : `Descuadre — efectivo ${difEfectivo >= 0 ? "+" : ""}${eur(difEfectivo)} · datáfono ${difTarjeta >= 0 ? "+" : ""}${eur(difTarjeta)}. Puedes cerrar igual: queda registrado.`}
              </div>
            )}

            <button
              onClick={() =>
                ejecutar(
                  () => cerrarCaja({ fecha: datos.fecha, efectivoContado: contado, datafono, fondoSiguiente: fondoSig, notas }),
                  () => setEditando(false),
                )
              }
              disabled={ocupado || contadoTxt === "" || datafonoTxt === "" || datos.ticketsAbiertos.length > 0}
              className="mt-3.5 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
            >
              <Lock className="size-4.5" /> {ocupado ? "Cerrando…" : "Cerrar caja del día"}
            </button>
          </>
        )}
      </div>

      {/* ── Retiradas de efectivo ── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
          <Minus className="size-4 text-ink-soft" /> Retiradas de efectivo
        </div>
        <p className="mt-1 mb-3 text-[12px] leading-relaxed text-ink-soft">
          Dinero que sacas del cajón durante el día (pagar a un proveedor, cambio…). Se resta del efectivo esperado.
        </p>

        <div className="flex flex-col gap-2">
          {datos.retiradas.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-semibold">{r.motivo || "Retirada"}</b>
                <small className="text-[11.5px] text-ink-soft">{r.hora}</small>
              </div>
              <b className="font-display text-[14px] font-bold text-bad">−{eur(r.importe)}</b>
              {!c && (
                <button
                  onClick={() => ejecutar(() => eliminarRetirada(r.id))}
                  disabled={ocupado}
                  className="cursor-pointer rounded-lg p-1 text-ink-soft hover:bg-bad-soft hover:text-bad"
                  aria-label="Eliminar retirada"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {datos.retiradas.length === 0 && (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-soft">
              Sin retiradas.
            </p>
          )}
        </div>

        {datos.retiradasTotal > 0 && (
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-[13px]">
            <span className="text-ink-soft">Total retirado</span>
            <b className="font-display font-bold text-bad">−{eur(datos.retiradasTotal)}</b>
          </div>
        )}

        {/* Alta de retirada (solo mientras la caja no está cerrada) */}
        {!c && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={retImporte}
                onChange={(e) => setRetImporte(e.target.value)}
                placeholder="€"
                className="w-20 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <input
                value={retMotivo}
                onChange={(e) => setRetMotivo(e.target.value)}
                placeholder="Motivo (proveedor, cambio…)"
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={() =>
                  ejecutar(
                    () => crearRetirada({ fecha: datos.fecha, importe: parseFloat(retImporte.replace(",", ".")), motivo: retMotivo }),
                    () => {
                      setRetImporte("");
                      setRetMotivo("");
                    },
                  )
                }
                disabled={!retImporte.trim() || ocupado}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
              >
                <Plus className="size-3.5" /> Nueva
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContadorEfectivo({
  conteo,
  onDenom,
  total,
  dif,
  cuadra,
  onVaciar,
}: {
  conteo: Record<number, number>;
  onDenom: (c: number, cantidad: number) => void;
  total: number;
  dif: number;
  cuadra: boolean;
  onVaciar: () => void;
}) {
  return (
    <div className="mt-3.5 rounded-2xl border border-line bg-hover/40 p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wider text-ink-soft uppercase">
          <Calculator className="size-3.5" /> Recuento de billetes y monedas
        </span>
        <button
          type="button"
          onClick={onVaciar}
          className="cursor-pointer text-[11.5px] font-semibold text-ink-soft underline-offset-2 hover:text-bad hover:underline"
        >
          Vaciar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-1 max-sm:grid-cols-1">
        <div>
          <div className="mb-1 text-[10.5px] font-semibold tracking-wider text-ink-soft uppercase">Billetes</div>
          {BILLETES.map((c) => (
            <FilaDenom key={c} c={c} cantidad={conteo[c] || 0} onDenom={onDenom} />
          ))}
        </div>
        <div>
          <div className="mb-1 text-[10.5px] font-semibold tracking-wider text-ink-soft uppercase">Monedas</div>
          {MONEDAS.map((c) => (
            <FilaDenom key={c} c={c} cantidad={conteo[c] || 0} onDenom={onDenom} />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <span className="text-[13px] font-semibold text-ink-soft">Total contado</span>
        <span className="flex items-center gap-2">
          <b className="font-display text-[18px] font-bold">{eur(total)}</b>
          {total > 0 && (cuadra ? <Chip tone="good">cuadra ✓</Chip> : <Chip tone={Math.abs(dif) > 5 ? "bad" : "warn"}>{dif > 0 ? "sobran" : "faltan"} {eur(Math.abs(dif))}</Chip>)}
        </span>
      </div>
    </div>
  );
}

function FilaDenom({ c, cantidad, onDenom }: { c: number; cantidad: number; onDenom: (c: number, cantidad: number) => void }) {
  const subtotal = (c * cantidad) / 100;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-12 shrink-0 text-[13px] font-semibold">{etiquetaDenom(c)}</span>
      <button
        type="button"
        onClick={() => onDenom(c, cantidad - 1)}
        disabled={cantidad <= 0}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border border-line text-ink-soft hover:bg-chip disabled:opacity-30"
        aria-label={`Quitar ${etiquetaDenom(c)}`}
      >
        <Minus className="size-3" />
      </button>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={cantidad === 0 ? "" : cantidad}
        onChange={(e) => onDenom(c, parseInt(e.target.value, 10) || 0)}
        placeholder="0"
        className="w-12 rounded-md border border-line bg-card px-1 py-1 text-center text-[13px] font-semibold outline-none focus:border-brand"
      />
      <button
        type="button"
        onClick={() => onDenom(c, cantidad + 1)}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border border-line text-ink-soft hover:bg-chip"
        aria-label={`Añadir ${etiquetaDenom(c)}`}
      >
        <Plus className="size-3" />
      </button>
      <span className={cn("ml-auto w-16 text-right font-display text-[12.5px] font-bold", subtotal === 0 && "text-ink-soft/40")}>
        {eur(subtotal)}
      </span>
    </div>
  );
}

function MiniKpi({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-[10.5px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className="mt-0.5 font-display text-[19px] font-bold tracking-tight">{valor}</div>
      <div className="text-[11px] text-ink-soft">{detalle}</div>
    </div>
  );
}

function Campo({
  etiqueta,
  detalle,
  valor,
  onCambio,
  children,
}: {
  etiqueta: string;
  detalle: string;
  valor: string;
  onCambio: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <label className="block text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
      {etiqueta}
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="0,00"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          className="block w-32 rounded-xl border border-line bg-card px-3 py-2.5 font-display text-[16px] font-bold tracking-normal outline-none focus:border-brand"
        />
        <span className="font-display text-[14px] font-bold text-ink-soft">€</span>
        {children}
      </span>
      <span className="mt-0.5 block font-body text-[11px] font-normal tracking-normal normal-case">{detalle}</span>
    </label>
  );
}

function Diferencia({ dif, cuadra }: { dif: number; cuadra: boolean }) {
  if (cuadra) return <Chip tone="good">cuadra ✓</Chip>;
  return (
    <Chip tone={Math.abs(dif) > 5 ? "bad" : "warn"}>
      {dif > 0 ? "sobran" : "faltan"} {eur(Math.abs(dif))}
    </Chip>
  );
}

function Cuadre({
  icono,
  titulo,
  contado,
  esperado,
}: {
  icono: React.ReactNode;
  titulo: string;
  contado: number;
  esperado: number;
}) {
  const dif = contado - esperado;
  const cuadra = Math.abs(dif) < 0.005;
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
        {icono} {titulo}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between text-[13px]">
        <span className="text-ink-soft">Contado</span>
        <b className="font-display text-[15px] font-bold">{eur(contado)}</b>
      </div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink-soft">Esperado</span>
        <b className="font-display text-[15px] font-bold">{eur(esperado)}</b>
      </div>
      <div className="mt-1.5 border-t border-line pt-1.5">
        {cuadra ? (
          <Chip tone="good">cuadra al céntimo ✓</Chip>
        ) : (
          <Chip tone={Math.abs(dif) > 5 ? "bad" : "warn"}>
            {dif > 0 ? "sobran" : "faltan"} {eur(Math.abs(dif))}
          </Chip>
        )}
      </div>
    </div>
  );
}
