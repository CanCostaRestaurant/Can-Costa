"use client";

// Motor de reserva público en dos pasos (1. Reserva → 2. Cliente), estilo
// Last.app/CoverManager. Filosofía anti-pérdida de reserva: la parrilla
// muestra TODAS las horas del turno como elegibles (nunca tachadas); solo al
// darle a Continuar se comprueba la disponibilidad en fresco y, si esa hora
// está completa, se proponen las horas libres más cercanas para que el
// cliente no se vaya sin reservar.
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarCheck, Check, ChevronRight, MapPin, Users } from "lucide-react";
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

const aMin = (h: string) => {
  const [H, M] = h.split(":").map(Number);
  return H * 60 + M;
};

const estaLibre = (s: SlotDisponibilidad) => s.estado === "libre" || s.estado === "pocas";

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
  const [paso, setPaso] = useState<"reserva" | "cliente">("reserva");
  const [pax, setPax] = useState(2);
  const [fecha, setFecha] = useState(fechas[0].valor);
  const [hora, setHora] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotDisponibilidad[] | null>(null);
  const [cargando, setCargando] = useState(false);

  // Aviso de hora completa + alternativas libres más cercanas.
  const [horaOcupada, setHoraOcupada] = useState<string | null>(null);
  const [alternativas, setAlternativas] = useState<SlotDisponibilidad[] | null>(null);
  const [comprobando, startComprobar] = useTransition();

  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [companyia, setCompanyia] = useState(""); // honeypot

  const [enviando, startEnvio] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<ResultadoReservaWeb | null>(null);

  // La parrilla de horas del día (turnos). Se pinta SIN estados de ocupación:
  // todas elegibles; la comprobación real llega al pulsar Continuar.
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setHora(null);
    setHoraOcupada(null);
    setAlternativas(null);
    disponibilidadPublica(fecha, pax)
      .then((res) => vivo && setSlots(res.ok ? (res.slots ?? []) : []))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [fecha, pax]);

  const servicios = useMemo(() => [...new Set((slots ?? []).map((s) => s.servicio))], [slots]);
  const slotElegido = (slots ?? []).find((s) => s.hora === hora);

  // Comprueba EN FRESCO la hora deseada; si está completa prepara las
  // alternativas libres más cercanas (máx. 6) en vez de dejar caer la venta.
  function continuar() {
    if (!hora) return;
    setError(null);
    startComprobar(async () => {
      const res = await disponibilidadPublica(fecha, pax);
      // Si la comprobación falla, dejamos avanzar: reservarPublica revalida
      // igualmente al confirmar (nunca se cuela una reserva sin mesa).
      if (!res.ok) {
        setPaso("cliente");
        return;
      }
      const frescos = res.slots ?? [];
      setSlots(frescos);
      const slot = frescos.find((s) => s.hora === hora);
      if (slot && estaLibre(slot)) {
        setHoraOcupada(null);
        setAlternativas(null);
        setPaso("cliente");
        return;
      }
      const objetivo = aMin(hora);
      const cercanas = frescos
        .filter(estaLibre)
        .sort((a, b) => Math.abs(aMin(a.hora) - objetivo) - Math.abs(aMin(b.hora) - objetivo))
        .slice(0, 6)
        .sort((a, b) => aMin(a.hora) - aMin(b.hora));
      setHoraOcupada(hora);
      setAlternativas(cercanas);
    });
  }

  function elegirAlternativa(h: string) {
    setHora(h);
    setHoraOcupada(null);
    setAlternativas(null);
    setPaso("cliente");
  }

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
        // Carrera: alguien pilló la mesa mientras rellenaba los datos →
        // volver al paso 1 con las alternativas ya cargadas.
        if (res.error?.toLowerCase().includes("mesa libre")) {
          setPaso("reserva");
          continuar();
          return;
        }
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
      <section className="anim-in flex flex-col justify-center rounded-[26px] bg-paper/95 p-7 text-center shadow-2xl backdrop-blur-sm md:p-9">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-good-soft text-good">
          <Check className="size-7" />
        </div>
        <h2 className="mt-4 font-display text-[24px] font-extrabold tracking-tight">¡Reserva confirmada!</h2>
        <p className="mt-1 text-[14px] text-ink-soft">Te esperamos, {nombre.split(" ")[0]}.</p>

        <div className="mx-auto mt-5 w-full max-w-sm rounded-2xl bg-card px-5 py-4 text-left shadow-(--shadow-card)">
          <Dato etiqueta="Día" valor={fechaLarga(hecho.fecha!)} />
          <Dato etiqueta="Hora" valor={`${hecho.hora} · mesa hasta las ${hecho.hastaHora}`} />
          <Dato etiqueta="Comensales" valor={String(hecho.comensales)} />
        </div>

        <p className="mt-4 text-[12.5px] text-ink-soft">
          {hecho.emailEnviado || hecho.smsEnviado
            ? `Te hemos enviado la confirmación${hecho.emailEnviado ? " por email" : ""}${
                hecho.emailEnviado && hecho.smsEnviado ? " y" : ""
              }${hecho.smsEnviado ? " por SMS" : ""}.`
            : "Apunta la reserva o añádela a tu calendario para no olvidarla."}
        </p>

        <div className="mx-auto mt-5 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
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
      </section>
    );
  }

  // ── Motor en dos pasos ──
  return (
    <section className="anim-in rounded-[26px] bg-paper/95 p-6 shadow-2xl backdrop-blur-sm md:p-8">
      {/* Migas de paso: 1. Reserva → 2. Cliente */}
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPaso("reserva")}
          className={cn(
            "cursor-pointer border-b-2 pb-1 font-display text-[15px] font-bold tracking-tight transition-colors",
            paso === "reserva" ? "border-brand text-ink" : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          1. Reserva
        </button>
        <ChevronRight className="size-4 text-ink-soft" />
        <span
          className={cn(
            "border-b-2 pb-1 font-display text-[15px] font-bold tracking-tight",
            paso === "cliente" ? "border-brand text-ink" : "border-transparent text-ink-soft",
          )}
        >
          2. Cliente
        </span>
      </div>

      {paso === "reserva" ? (
        <>
          <h2 className="mb-3 font-display text-[19px] font-extrabold tracking-tight">
            Detalles de la reserva
          </h2>

          {/* Selectores Grupo / Fecha */}
          <div className="mb-5 grid grid-cols-2 gap-3">
            <Campo icono={<Users className="size-4" />} etiqueta="Comensales">
              <select
                value={pax}
                onChange={(e) => setPax(Number(e.target.value))}
                className="w-full cursor-pointer rounded-xl border border-line bg-card px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-brand"
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
                className="w-full cursor-pointer rounded-xl border border-line bg-card px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-brand"
              >
                {fechas.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {/* Parrilla de horas: TODAS elegibles (la disponibilidad se
              comprueba al continuar, para no perder la reserva de entrada) */}
          <div className="mb-2 text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Elige tu hora
          </div>

          {cargando && (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-hover" />
              ))}
            </div>
          )}

          {slots !== null && slots.length === 0 && !cargando && (
            <p className="rounded-xl bg-hover px-3.5 py-3 text-[13px] text-ink-soft">
              No hay horario de reservas para este día. Prueba con otra fecha o llámanos
              {telefono ? ` al ${telefono}` : ""}.
            </p>
          )}

          {!cargando &&
            servicios.map((servicio) => (
              <div key={servicio} className="mb-3 last:mb-0">
                <div className="mb-1.5 text-[12.5px] font-semibold text-ink">{servicio}</div>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {(slots ?? [])
                    .filter((s) => s.servicio === servicio)
                    .map((s) => (
                      <button
                        key={s.hora}
                        type="button"
                        onClick={() => {
                          setHora(s.hora);
                          setHoraOcupada(null);
                          setAlternativas(null);
                        }}
                        className={cn(
                          "cursor-pointer rounded-xl border py-2.5 text-[14px] font-semibold transition-all",
                          hora === s.hora
                            ? "border-brand bg-brand text-white shadow-(--shadow-card)"
                            : "border-line bg-card hover:-translate-y-0.5 hover:border-brand",
                        )}
                      >
                        {s.hora}
                      </button>
                    ))}
                </div>
              </div>
            ))}

          {/* Hora completa → alternativas cercanas (cross-selling de horas) */}
          {horaOcupada && alternativas && (
            <div className="anim-in mt-4 rounded-2xl bg-warn-soft p-4">
              <p className="text-[13.5px] font-semibold text-[#7A5106]">
                A las {horaOcupada} estamos completos para {pax}{" "}
                {pax === 1 ? "persona" : "personas"}.
              </p>
              {alternativas.length > 0 ? (
                <>
                  <p className="mt-0.5 mb-2.5 text-[13px] text-[#7A5106]">
                    Pero tenemos mesa a estas horas — elige una y sigue:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {alternativas.map((s) => (
                      <button
                        key={s.hora}
                        type="button"
                        onClick={() => elegirAlternativa(s.hora)}
                        className="cursor-pointer rounded-xl border border-[#E8C877] bg-card px-3.5 py-2 text-[14px] font-bold transition-all hover:border-brand hover:bg-brand hover:text-white"
                      >
                        {s.hora}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-0.5 text-[13px] text-[#7A5106]">
                  Ese día lo tenemos completo. Prueba con otra fecha
                  {telefono ? ` o llámanos al ${telefono}` : ""}.
                </p>
              )}
            </div>
          )}

          <button
            onClick={continuar}
            disabled={!hora || comprobando || cargando}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-5 py-3.5 text-[15px] font-semibold text-white shadow-(--shadow-lift) transition-all hover:bg-[#d34322] active:scale-[0.99] disabled:opacity-40"
          >
            {comprobando ? "Comprobando…" : "Continuar"}
            {!comprobando && <ChevronRight className="size-4" />}
          </button>
        </>
      ) : (
        <>
          <h2 className="mb-1 font-display text-[19px] font-extrabold tracking-tight">Tus datos</h2>

          {/* Resumen de lo elegido */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
            <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-brand">
              {fechaLarga(fecha)} · {hora}
            </span>
            <span className="rounded-lg bg-chip px-2.5 py-1 text-ink-soft">
              {pax} {pax === 1 ? "persona" : "personas"}
              {slotElegido ? ` · mesa hasta ${slotElegido.hastaHora}` : ""}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <input
              placeholder="Nombre y apellido *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
            />
            <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
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

          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => setPaso("reserva")}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-4 py-3.5 text-[14px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-ink"
            >
              <ArrowLeft className="size-4" /> Volver
            </button>
            <button
              onClick={confirmar}
              disabled={enviando || !nombre.trim() || (!tel.trim() && !email.trim())}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-brand px-5 py-3.5 text-[15px] font-semibold text-white shadow-(--shadow-lift) transition-all hover:bg-[#d34322] active:scale-[0.99] disabled:opacity-40"
            >
              {enviando ? "Reservando…" : "Confirmar reserva"}
              {!enviando && <ChevronRight className="size-4" />}
            </button>
          </div>
        </>
      )}
    </section>
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
