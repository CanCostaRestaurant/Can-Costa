"use client";

// Los mandos del cover manager, como los configura CoverManager: doblaje
// por tamaño de grupo, margen entre reservas, turnos de servicio y cupo
// de entrada por tramo. Se guardan en BD y el asignador los usa al vuelo.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { PageHead } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { MandosReservas, ServicioTurno } from "@/lib/reservas/config";
import { guardarMandosReservas } from "../actions";

const OPCIONES_DOBLAJE = [45, 60, 75, 90, 105, 120, 150, 180]; // minutos

function etiquetaMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function AjustesReservasClient({ inicial }: { inicial: MandosReservas }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [mandos, setMandos] = useState<MandosReservas>(inicial);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  function guardar() {
    setMensaje(null);
    startAccion(async () => {
      const res = await guardarMandosReservas(mandos);
      setMensaje(
        res.ok
          ? { tipo: "ok", texto: "Ajustes guardados — las próximas reservas ya los usan" }
          : { tipo: "error", texto: res.error ?? "No se pudo guardar" },
      );
      if (res.ok) router.refresh();
    });
  }

  const setDoblaje = (clave: keyof MandosReservas["doblaje"], valor: number) =>
    setMandos((m) => ({ ...m, doblaje: { ...m.doblaje, [clave]: valor } }));

  const setServicio = (i: number, campo: keyof ServicioTurno, valor: string) =>
    setMandos((m) => ({
      ...m,
      servicios: m.servicios.map((s, j) => (j === i ? { ...s, [campo]: valor } : s)),
    }));

  return (
    <>
      <PageHead
        titulo="Ajustes de reservas"
        subtitulo="Doblaje de mesas, turnos y cupos — los mandos del cover manager"
        derecha={
          <button
            onClick={guardar}
            disabled={ocupado}
            className="cursor-pointer rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {ocupado ? "Guardando…" : "Guardar ajustes"}
          </button>
        }
      />

      {mensaje && (
        <div
          className={cn(
            "mb-3.5 rounded-[14px] px-4 py-3 text-[13.5px] font-semibold",
            mensaje.tipo === "ok" ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
          )}
        >
          {mensaje.texto}
        </div>
      )}

      <div className="grid grid-cols-2 items-start gap-3.5 max-md:grid-cols-1">
        {/* ── Doblaje ── */}
        <div className="card p-5">
          <h3 className="font-display text-base font-bold tracking-tight">Doblaje de mesas</h3>
          <p className="mt-1 mb-4 text-[13px] leading-relaxed text-ink-soft">
            Cuánto tiempo tiene cada grupo su mesa. Al terminar (más el margen de limpieza), la mesa
            vuelve a estar libre y <b>se dobla</b> con la siguiente reserva. Al cliente se le informa
            de su tiempo en la confirmación.
          </p>
          {(
            [
              ["hasta2", "1–2 comensales"],
              ["hasta4", "3–4 comensales"],
              ["hasta6", "5–6 comensales"],
              ["grandes", "7 o más"],
            ] as const
          ).map(([clave, etiqueta]) => (
            <div key={clave} className="mb-3 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{etiqueta}</span>
              <div className="flex flex-wrap justify-end gap-1">
                {OPCIONES_DOBLAJE.map((min) => (
                  <button
                    key={min}
                    onClick={() => setDoblaje(clave, min)}
                    className={cn(
                      "cursor-pointer rounded-lg border px-2 py-1 text-[12px] font-semibold transition-colors",
                      mandos.doblaje[clave] === min
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-card text-ink-soft hover:border-brand",
                    )}
                  >
                    {etiquetaMin(min)}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
            <div>
              <span className="text-sm font-semibold">Margen de limpieza</span>
              <p className="text-[12px] text-ink-soft">Minutos entre reservas de la misma mesa</p>
            </div>
            <input
              type="number"
              min="0"
              max="60"
              step="5"
              value={mandos.margenLimpiezaMin}
              onChange={(e) =>
                setMandos((m) => ({ ...m, margenLimpiezaMin: parseInt(e.target.value, 10) || 0 }))
              }
              className="w-20 rounded-xl border border-line bg-card px-3 py-2 text-center text-sm font-semibold outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          {/* ── Turnos ── */}
          <div className="card p-5">
            <h3 className="font-display text-base font-bold tracking-tight">Turnos de servicio</h3>
            <p className="mt-1 mb-3 text-[13px] leading-relaxed text-ink-soft">
              Las horas reservables (de la primera a la última entrada). Fuera de turno, la hora sale
              como &quot;no disponible&quot; y solo se asigna a mano.
            </p>
            {mandos.servicios.map((s, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <input
                  value={s.nombre}
                  onChange={(e) => setServicio(i, "nombre", e.target.value)}
                  placeholder="Nombre"
                  className="w-28 rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  type="time"
                  value={s.inicio}
                  onChange={(e) => setServicio(i, "inicio", e.target.value)}
                  className="rounded-xl border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                />
                <span className="text-ink-soft">→</span>
                <input
                  type="time"
                  value={s.fin}
                  onChange={(e) => setServicio(i, "fin", e.target.value)}
                  className="rounded-xl border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                />
                <button
                  onClick={() =>
                    setMandos((m) => ({ ...m, servicios: m.servicios.filter((_, j) => j !== i) }))
                  }
                  className="cursor-pointer rounded-lg p-1.5 text-ink-soft hover:bg-bad-soft hover:text-bad"
                  aria-label={`Eliminar turno ${s.nombre}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setMandos((m) => ({
                  ...m,
                  servicios: [...m.servicios, { nombre: "Turno", inicio: "13:00", fin: "15:30" }],
                }))
              }
              className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:border-brand hover:text-ink"
            >
              <Plus className="size-3.5" /> Añadir turno
            </button>

            {/* ── Días de cierre semanal ── */}
            <div className="mt-4 border-t border-line pt-3.5">
              <span className="text-sm font-semibold">Días de cierre</span>
              <p className="mt-0.5 mb-2 text-[12px] text-ink-soft">
                La web y el teléfono no aceptan reservas estos días (a mano desde el CRM sí, para
                eventos).
              </p>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    [1, "Lun"],
                    [2, "Mar"],
                    [3, "Mié"],
                    [4, "Jue"],
                    [5, "Vie"],
                    [6, "Sáb"],
                    [0, "Dom"],
                  ] as const
                ).map(([dia, etiqueta]) => {
                  const cerrado = mandos.diasCierre.includes(dia);
                  return (
                    <button
                      key={dia}
                      onClick={() =>
                        setMandos((m) => ({
                          ...m,
                          diasCierre: cerrado
                            ? m.diasCierre.filter((d) => d !== dia)
                            : [...m.diasCierre, dia],
                        }))
                      }
                      title={cerrado ? "Cerrado — clic para abrir" : "Abierto — clic para cerrar"}
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                        cerrado
                          ? "border-bad bg-bad-soft text-bad line-through"
                          : "border-line bg-card text-ink-soft hover:border-brand",
                      )}
                    >
                      {etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Cupo por tramo ── */}
          <div className="card p-5">
            <h3 className="font-display text-base font-bold tracking-tight">Ritmo de entrada</h3>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div>
                <span className="text-sm font-semibold">Cupo de comensales por tramo</span>
                <p className="text-[12px] text-ink-soft">
                  Máximo que puede ENTRAR cada {mandos.pasoMin} min (protege la cocina). 0 = sin límite.
                </p>
              </div>
              <input
                type="number"
                min="0"
                max="500"
                value={mandos.cupoPorTramo}
                onChange={(e) =>
                  setMandos((m) => ({ ...m, cupoPorTramo: parseInt(e.target.value, 10) || 0 }))
                }
                className="w-20 rounded-xl border border-line bg-card px-3 py-2 text-center text-sm font-semibold outline-none focus:border-brand"
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
              <span className="text-sm font-semibold">Tramos de la parrilla</span>
              <div className="flex gap-1">
                {[15, 30].map((paso) => (
                  <button
                    key={paso}
                    onClick={() => setMandos((m) => ({ ...m, pasoMin: paso }))}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors",
                      mandos.pasoMin === paso
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-card text-ink-soft hover:border-brand",
                    )}
                  >
                    {paso} min
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Datos para notificaciones ── */}
          <div className="card p-5">
            <h3 className="font-display text-base font-bold tracking-tight">Confirmaciones al cliente</h3>
            <p className="mt-1 mb-3 text-[13px] leading-relaxed text-ink-soft">
              Datos que van en el email/SMS de confirmación (con enlace a Google Maps y botón de
              añadir al calendario).
            </p>
            {(
              [
                ["nombre", "Nombre del restaurante"],
                ["direccion", "Dirección"],
                ["telefono", "Teléfono"],
                ["mapsUrl", "Enlace de Google Maps (opcional)"],
              ] as const
            ).map(([clave, etiqueta]) => (
              <label key={clave} className="mb-2 block text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
                {etiqueta}
                <input
                  value={mandos.restaurante[clave]}
                  onChange={(e) =>
                    setMandos((m) => ({ ...m, restaurante: { ...m.restaurante, [clave]: e.target.value } }))
                  }
                  className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2 font-body text-sm font-normal tracking-normal outline-none focus:border-brand"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
