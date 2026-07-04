"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, Check, CreditCard, Lock, TriangleAlert } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { type CierreDia } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { cerrarCaja } from "./actions";

export function CierreClient({ datos, hoy }: { datos: CierreDia; hoy: string }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [editando, setEditando] = useState(false);

  const c = datos.cierre;
  const [contadoTxt, setContadoTxt] = useState(c ? String(c.efectivoContado) : "");
  const [datafonoTxt, setDatafonoTxt] = useState(c ? String(c.datafono) : "");
  const [fondoTxt, setFondoTxt] = useState(c ? String(c.fondoSiguiente) : String(datos.fondoAnterior));
  const [notas, setNotas] = useState(c?.notas ?? "");

  const contado = parseFloat(contadoTxt.replace(",", ".")) || 0;
  const datafono = parseFloat(datafonoTxt.replace(",", ".")) || 0;
  const fondoSig = parseFloat(fondoTxt.replace(",", ".")) || 0;

  // Cajón esperado = fondo con el que se abrió + ventas en efectivo del día.
  const cajonEsperado = datos.fondoAnterior + datos.efectivoEsperado;
  const difEfectivo = contado - cajonEsperado;
  const difTarjeta = datafono - datos.tarjetaEsperada;
  const cuadraEfectivo = Math.abs(difEfectivo) < 0.005;
  const cuadraTarjeta = Math.abs(difTarjeta) < 0.005;

  const mostrandoResumen = c !== null && !editando;

  function guardar() {
    setError(null);
    startAccion(async () => {
      const res = await cerrarCaja({
        fecha: datos.fecha,
        efectivoContado: contado,
        datafono,
        fondoSiguiente: fondoSig,
        notas,
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo cerrar la caja");
        return;
      }
      setHecho(true);
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <section className="anim-in mx-auto max-w-3xl">
      <PageHead
        titulo="Cierre de caja"
        subtitulo="Cuadra el efectivo del cajón y el cierre del datáfono contra lo que dice el TPV"
        derecha={
          <div className="flex items-center gap-2">
            <Link
              href="/tpv"
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-[13.5px] font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-4" /> TPV
            </Link>
            <DatePicker
              value={datos.fecha}
              align="right"
              onChange={(v) => v && router.push(v === hoy ? "/tpv/cierre" : `/tpv/cierre?dia=${v}`)}
            />
          </div>
        }
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">{error}</div>
      )}
      {hecho && !error && (
        <div className="mb-3.5 flex items-center gap-2 rounded-[14px] bg-good-soft px-4 py-3 text-[13.5px] font-semibold text-good">
          <Check className="size-4.5" /> Caja cerrada y guardada
        </div>
      )}

      {/* Mesas abiertas bloquean el cierre */}
      {datos.ticketsAbiertos.length > 0 && (
        <div className="card mb-3.5 border-warn bg-warn-soft p-5">
          <div className="flex items-center gap-2.5 font-display text-[15px] font-bold text-[#7A5106]">
            <TriangleAlert className="size-5 text-warn" />
            {datos.ticketsAbiertos.length} mesa(s) sin cobrar — ciérralas antes del cierre
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {datos.ticketsAbiertos.map((t) => (
              <Link
                key={t.id}
                href={`/tpv?ticket=${t.id}`}
                className="rounded-full border border-[#EED9AC] bg-card px-3 py-1.5 text-[13px] font-semibold transition-colors hover:border-warn"
              >
                {t.mesa} · {eur(t.total)}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Lo que dice el TPV */}
      <div className="mb-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
        <Kpi etiqueta="Ventas del día" valor={eur(datos.totalDia)} detalle={`${datos.numTickets} tickets`} />
        <Kpi
          etiqueta="Efectivo esperado en cajón"
          valor={eur(cajonEsperado)}
          detalle={`fondo ${eur(datos.fondoAnterior, false)} + ventas ${eur(datos.efectivoEsperado, false)}`}
        />
        <Kpi etiqueta="Tarjeta esperada" valor={eur(datos.tarjetaEsperada)} detalle="debe salir en el datáfono" />
      </div>

      {mostrandoResumen ? (
        /* ── Cierre ya hecho: resumen ── */
        <div className="card p-5.5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
              <Lock className="size-4.5 text-ink-soft" /> Caja cerrada
            </h3>
            <span className="text-[12.5px] text-ink-soft">
              {c!.cerradoPor ? `por ${c!.cerradoPor} · ` : ""}a las {c!.actualizado}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
            <Cuadre
              icono={<Banknote className="size-4.5" />}
              titulo="Efectivo"
              contado={c!.efectivoContado}
              esperado={c!.fondoAnterior + c!.efectivoEsperado}
            />
            <Cuadre
              icono={<CreditCard className="size-4.5" />}
              titulo="Datáfono"
              contado={c!.datafono}
              esperado={c!.tarjetaEsperada}
            />
          </div>
          <div className="mt-3.5 flex items-center justify-between rounded-xl bg-chip px-4 py-3 text-[13.5px]">
            <span className="text-ink-soft">Fondo que queda para mañana</span>
            <b className="font-display text-[16px] font-bold">{eur(c!.fondoSiguiente)}</b>
          </div>
          {c!.notas && (
            <p className="mt-3 rounded-xl border border-line px-4 py-3 text-[13.5px] text-ink-soft">{c!.notas}</p>
          )}
          <button
            onClick={() => setEditando(true)}
            className="mt-4 cursor-pointer rounded-xl border border-line px-4 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-[#CFC6B4] hover:text-ink"
          >
            Rehacer el cierre
          </button>
        </div>
      ) : (
        /* ── Formulario de cierre ── */
        <div className="card p-5.5">
          <h3 className="mb-4 font-display text-base font-bold tracking-tight">Recuento</h3>
          <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
            <Campo
              etiqueta="Efectivo contado en el cajón"
              detalle="todo lo que hay, incluido el fondo"
              valor={contadoTxt}
              onCambio={setContadoTxt}
            >
              {contadoTxt !== "" && (
                <Diferencia dif={difEfectivo} cuadra={cuadraEfectivo} />
              )}
            </Campo>
            <Campo
              etiqueta="Total del cierre del datáfono"
              detalle="haz el cierre en el datáfono y copia el total"
              valor={datafonoTxt}
              onCambio={setDatafonoTxt}
            >
              {datafonoTxt !== "" && <Diferencia dif={difTarjeta} cuadra={cuadraTarjeta} />}
            </Campo>
            <Campo
              etiqueta="Fondo que dejas para mañana"
              detalle="cambio que se queda en el cajón"
              valor={fondoTxt}
              onCambio={setFondoTxt}
            >
              {contadoTxt !== "" && fondoSig > contado && (
                <span className="text-[12px] font-semibold text-bad">mayor que lo contado</span>
              )}
            </Campo>
            <label className="block text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Notas
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="incidencias, invitaciones, propinas…"
                className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2.5 font-body text-[14px] font-normal tracking-normal outline-none focus:border-brand"
              />
            </label>
          </div>

          {contadoTxt !== "" && datafonoTxt !== "" && (
            <div
              className={cn(
                "mt-4 rounded-xl px-4 py-3 text-[13.5px] font-semibold",
                cuadraEfectivo && cuadraTarjeta ? "bg-good-soft text-good" : "bg-warn-soft text-[#7A5106]",
              )}
            >
              {cuadraEfectivo && cuadraTarjeta
                ? "✓ Todo cuadra al céntimo"
                : `Descuadre — efectivo ${difEfectivo >= 0 ? "+" : ""}${eur(difEfectivo)} · datáfono ${difTarjeta >= 0 ? "+" : ""}${eur(difTarjeta)}. Puedes cerrar igualmente: quedará registrado.`}
            </div>
          )}

          <button
            onClick={guardar}
            disabled={ocupado || contadoTxt === "" || datafonoTxt === "" || datos.ticketsAbiertos.length > 0}
            className="mt-4 flex min-h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            <Lock className="size-4.5" /> {ocupado ? "Cerrando…" : "Cerrar caja del día"}
          </button>
          {datos.ticketsAbiertos.length > 0 && (
            <p className="mt-2 text-center text-[12px] text-ink-soft">cierra primero las mesas abiertas</p>
          )}
        </div>
      )}
    </section>
  );
}

function Kpi({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <div className="card p-4.5">
      <div className="text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className="mt-1 font-display text-[24px] font-bold tracking-tight">{valor}</div>
      <div className="text-[12px] text-ink-soft">{detalle}</div>
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
    <label className="block text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
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
          className="block w-36 rounded-xl border border-line bg-card px-3 py-2.5 font-display text-[17px] font-bold tracking-normal outline-none focus:border-brand"
        />
        <span className="font-display text-[15px] font-bold text-ink-soft">€</span>
        {children}
      </span>
      <span className="mt-0.5 block font-body text-[11.5px] font-normal tracking-normal normal-case">{detalle}</span>
    </label>
  );
}

function Diferencia({ dif, cuadra }: { dif: number; cuadra: boolean }) {
  if (cuadra) return <Chip tone="good">cuadra ✓</Chip>;
  return <Chip tone={Math.abs(dif) > 5 ? "bad" : "warn"}>{dif > 0 ? "sobran" : "faltan"} {eur(Math.abs(dif))}</Chip>;
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
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
        {icono} {titulo}
      </div>
      <div className="mt-2 flex items-baseline justify-between text-[13.5px]">
        <span className="text-ink-soft">Contado</span>
        <b className="font-display text-[16px] font-bold">{eur(contado)}</b>
      </div>
      <div className="flex items-baseline justify-between text-[13.5px]">
        <span className="text-ink-soft">Esperado</span>
        <b className="font-display text-[16px] font-bold">{eur(esperado)}</b>
      </div>
      <div className="mt-2 border-t border-line pt-2">
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
