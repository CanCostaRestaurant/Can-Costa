"use client";

// Widget público de reserva estilo CoverManager: Grupo / Fecha / Hora con
// disponibilidad real, luego datos de contacto, luego confirmación. Reutiliza
// el motor del CRM vía las actions públicas.
import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarCheck, Check, ChevronRight, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { disponibilidadPublica, reservarPublica, type ResultadoReservaWeb } from "./actions";
import type { SlotDisponibilidad } from "@/lib/reservas/disponibilidad";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Próximos 30 días como opciones de fecha (etiqueta amable: Hoy / Mañana / …).
function opcionesFecha(): { valor: string; etiqueta: string }[] {
  const hoy = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const etiqueta =
      i === 0 ? "Hoy" : i === 1 ? "Mañana" : `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
    return { valor, etiqueta };
  });
}

function fechaLarga(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dia = new Date(y, m - 1, d).getDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}

export function ReservarWidget({
  nombreLocal,
  telefono,
  mapsUrl,
}: {
  nombreLocal: string;
  telefono: string;
  mapsUrl: string;
}) {
  const fechas = useMemo(opcionesFecha, []);
  const [pax, setPax] = useState(2);
  const [fecha, setFecha] = useState(fechas[0].valor);
  const [hora, setHora] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotDisponibilidad[] | null>(null);
  const [cargando, setCargando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [companyia, setCompanyia] = useState(""); // honeypot

  const [enviando, startEnvio] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<ResultadoReservaWeb | null>(null);

  // Recargar disponibilidad al cambiar grupo o fecha.
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setHora(null);
    disponibilidadPublica(fecha, pax)
      .then((res) => vivo && setSlots(res.ok ? (res.slots ?? []) : []))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [fecha, pax]);

  const servicios = useMemo(() => [...new Set((slots ?? []).map((s) => s.servicio))], [slots]);
  const slotElegido = (slots ?? []).find((s) => s.hora === hora);

  function confirmar() {
    setError(null);
    startEnvio(async () => {
      const res = await reservarPublica({
        nombre,
        telefono: tel,
        email,
        fecha,
        hora: hora!,
        comensales: pax,
        notas,
        companyia,
      });
      if (!res.ok) {
        setError(res.error ?? "No se pudo completar la reserva");
        return;
      }
      setHecho(res);
    });
  }

  // ── Pantalla final ──
  if (hecho) {
    const calUrl = (() => {
      const inicio = `${hecho.fecha!.replaceAll("-", "")}T${hecho.hora!.replace(":", "")}00`;
      const fin = `${hecho.fecha!.replaceAll("-", "")}T${(hecho.hastaHora ?? hecho.hora)!.replace(":", "")}00`;
      const p = new URLSearchParams({
        action: "TEMPLATE",
        text: `Reserva en ${nombreLocal}`,
        dates: `${inicio}/${fin}`,
        ctz: "Europe/Madrid",
      });
      return `https://calendar.google.com/calendar/render?${p.toString()}`;
    })();

    return (
      <div className="card anim-in overflow-hidden p-7 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-good-soft text-good">
          <Check className="size-7" />
        </div>
        <h2 className="mt-4 font-display text-[22px] font-extrabold tracking-tight">¡Reserva confirmada!</h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          Te esperamos, {nombre.split(" ")[0]}.
        </p>

        <div className="mt-5 rounded-2xl bg-hover px-5 py-4 text-left">
          <Dato etiqueta="Día" valor={fechaLarga(hecho.fecha!)} />
          <Dato etiqueta="Hora" valor={`${hecho.hora} · mesa hasta las ${hecho.hastaHora}`} />
          <Dato etiqueta="Comensales" valor={String(hecho.comensales)} />
        </div>

        <p className="mt-4 text-[12.5px] text-ink-soft">
          {email ? "Te hemos enviado la confirmación por email." : ""}
          {email && tel ? " " : ""}
          {tel ? "Te avisaremos por SMS." : ""}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <a
            href={calUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-black"
          >
            <CalendarCheck className="size-4" /> Añadir al calendario
          </a>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-[14px] font-semibold transition-colors hover:border-brand"
          >
            <MapPin className="size-4" /> Cómo llegar
          </a>
        </div>
      </div>
    );
  }

  // ── Widget de reserva ──
  return (
    <div className="card anim-in overflow-hidden">
      {/* Selectores Grupo / Fecha */}
      <div className="grid grid-cols-2 gap-3 border-b border-line p-4">
        <Campo icono={<Users className="size-4" />} etiqueta="Comensales">
          <select
            value={pax}
            onChange={(e) => setPax(Number(e.target.value))}
            className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-brand"
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "persona" : "personas"}
              </option>
            ))}
          </select>
        </Campo>
        <Campo icono={<CalendarCheck className="size-4" />} etiqueta="Fecha">
          <select
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-brand"
          >
            {fechas.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {/* Parrilla de horas */}
      <div className="p-4">
        <div className="mb-2 text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Elige tu hora {cargando && "…"}
        </div>

        {slots !== null && slots.length === 0 && !cargando && (
          <p className="rounded-xl bg-hover px-3.5 py-3 text-[13px] text-ink-soft">
            No hay horario de reservas para este día. Prueba con otra fecha o llámanos
            {telefono ? ` al ${telefono}` : ""}.
          </p>
        )}

        {servicios.map((servicio) => {
          const delServicio = (slots ?? []).filter((s) => s.servicio === servicio);
          const hayLibre = delServicio.some((s) => s.estado !== "lleno" && s.estado !== "cupo");
          return (
            <div key={servicio} className="mb-3 last:mb-0">
              <div className="mb-1.5 text-[12px] font-semibold text-ink">{servicio}</div>
              {!hayLibre && (
                <p className="mb-1.5 text-[12px] text-ink-soft">Sin mesas libres en este turno.</p>
              )}
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {delServicio.map((s) => {
                  const bloqueado = s.estado === "lleno" || s.estado === "cupo";
                  const activo = hora === s.hora;
                  return (
                    <button
                      key={s.hora}
                      type="button"
                      disabled={bloqueado}
                      onClick={() => setHora(s.hora)}
                      className={cn(
                        "rounded-xl border py-2 text-[14px] font-semibold transition-all",
                        activo
                          ? "border-brand bg-brand text-white shadow-(--shadow-card)"
                          : bloqueado
                            ? "cursor-not-allowed border-line bg-hover/60 text-ink-soft/40 line-through"
                            : "cursor-pointer border-line bg-card hover:border-brand hover:-translate-y-0.5",
                      )}
                    >
                      {s.hora}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Datos de contacto (aparecen al elegir hora) */}
      {hora && (
        <div className="anim-in border-t border-line bg-hover/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            <span className="rounded-lg bg-brand-soft px-2 py-0.5 text-brand">
              {slotElegido ? `${hora} · mesa hasta ${slotElegido.hastaHora}` : hora}
            </span>
            <span className="text-ink-soft">· {pax} pers.</span>
          </div>

          <div className="flex flex-col gap-2.5">
            <input
              placeholder="Nombre y apellido *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <input
                placeholder="Teléfono"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
              />
              <input
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
              />
            </div>
            <input
              placeholder="Alergias, trona, celebración… (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
            />
            {/* Honeypot anti-bots: oculto para humanos */}
            <input
              type="text"
              name="companyia"
              value={companyia}
              onChange={(e) => setCompanyia(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />
          </div>

          <p className="mt-2 text-[11.5px] text-ink-soft">
            Déjanos al menos un teléfono o un email para confirmarte la reserva.
          </p>

          {error && (
            <p className="mt-2.5 rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">
              {error}
            </p>
          )}

          <button
            onClick={confirmar}
            disabled={enviando || !nombre.trim() || (!tel.trim() && !email.trim())}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-5 py-3.5 text-[15px] font-semibold text-white shadow-(--shadow-lift) transition-all hover:bg-[#d34322] active:scale-[0.99] disabled:opacity-40"
          >
            {enviando ? "Reservando…" : "Confirmar reserva"}
            {!enviando && <ChevronRight className="size-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

function Campo({
  icono,
  etiqueta,
  children,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
        {icono}
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line py-1.5 last:border-none">
      <span className="text-[12.5px] text-ink-soft">{etiqueta}</span>
      <b className="font-display text-[14px] font-bold">{valor}</b>
    </div>
  );
}
