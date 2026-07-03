"use client";

// Parrilla de horas disponibles estilo CoverManager: tramos de 15 min por
// turno de servicio, con la ocupación real (lleno / quedan pocas / cupo del
// tramo cubierto) y "Horas no disponibles (asignar)" para forzar a mano.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { disponibilidadDia } from "./actions";
import type { SlotDisponibilidad } from "@/lib/reservas/disponibilidad";

export function SelectorHoras({
  fecha,
  pax,
  hora,
  onHora,
}: {
  fecha: string;
  pax: number;
  hora: string;
  onHora: (hora: string) => void;
}) {
  const [slots, setSlots] = useState<SlotDisponibilidad[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(pax) || pax < 1) return;
    let vivo = true;
    setCargando(true);
    disponibilidadDia(fecha, pax)
      .then((res) => {
        if (!vivo) return;
        setSlots(res.ok ? (res.slots ?? []) : []);
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [fecha, pax]);

  const servicios = [...new Set((slots ?? []).map((s) => s.servicio))];
  const seleccionado = (slots ?? []).find((s) => s.hora === hora);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Horas disponibles {cargando && "…"}
        </span>
        {seleccionado && (
          <span className="text-[11.5px] text-ink-soft">
            mesa hasta las <b>{seleccionado.hastaHora}</b>
          </span>
        )}
      </div>

      {slots !== null && slots.length === 0 && !cargando && (
        <p className="rounded-xl border border-line bg-hover/50 px-3 py-2.5 text-[12.5px] text-ink-soft">
          Sin turnos configurados para este día — ajusta los turnos en Ajustes o asigna la hora a mano.
        </p>
      )}

      {servicios.map((servicio) => (
        <div key={servicio} className="mb-2">
          <div className="mb-1 text-[11px] font-semibold text-ink-soft">{servicio}</div>
          <div className="grid grid-cols-5 gap-1.5 max-md:grid-cols-4">
            {(slots ?? [])
              .filter((s) => s.servicio === servicio)
              .map((s) => {
                const bloqueado = s.estado === "lleno" || s.estado === "cupo";
                const activo = hora === s.hora;
                return (
                  <button
                    key={s.hora}
                    type="button"
                    onClick={() => !bloqueado && onHora(s.hora)}
                    disabled={bloqueado}
                    title={
                      s.estado === "lleno"
                        ? "Sin mesa libre para este grupo"
                        : s.estado === "cupo"
                          ? `Cupo del tramo cubierto (${s.paxTramo}/${s.cupo})`
                          : s.estado === "pocas"
                            ? `Última mesa disponible · hasta las ${s.hastaHora}`
                            : `${s.mesasLibres} mesas libres · hasta las ${s.hastaHora}`
                    }
                    className={cn(
                      "flex flex-col items-center rounded-lg border px-1 py-1.5 text-[13px] font-semibold transition-colors",
                      activo
                        ? "border-brand bg-brand text-white"
                        : bloqueado
                          ? "cursor-not-allowed border-line bg-hover/60 text-ink-soft/50 line-through"
                          : s.estado === "pocas"
                            ? "cursor-pointer border-[#EED9AC] bg-warn-soft hover:border-warn"
                            : "cursor-pointer border-line bg-card hover:border-brand",
                    )}
                  >
                    {s.hora}
                    <small
                      className={cn(
                        "text-[9.5px] font-medium no-underline",
                        activo ? "text-white/80" : "text-ink-soft/80",
                      )}
                    >
                      {s.cupo !== null
                        ? `${s.paxTramo}/${s.cupo}`
                        : s.estado === "lleno"
                          ? "completo"
                          : s.estado === "pocas"
                            ? "última mesa"
                            : `${s.mesasLibres} mesas`}
                    </small>
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {/* Forzar una hora fuera de los turnos, como CoverManager */}
      <button
        type="button"
        onClick={() => setManual((v) => !v)}
        className="mt-1 cursor-pointer text-[12px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline"
      >
        Horas no disponibles (asignar)
      </button>
      {manual && (
        <input
          type="time"
          value={hora}
          onChange={(e) => e.target.value && onHora(e.target.value)}
          className="mt-1.5 block w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
        />
      )}
    </div>
  );
}
