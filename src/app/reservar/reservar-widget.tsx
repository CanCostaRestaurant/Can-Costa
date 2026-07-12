"use client";

// Motor de reserva público en dos pasos (1. Reserva → 2. Cliente), con
// calendario mensual real (estilo CoverManager pero sobrio). Filosofía
// anti-pérdida de reserva: la parrilla muestra TODAS las horas del turno como
// elegibles (nunca tachadas); solo al darle a Continuar se comprueba la
// disponibilidad en fresco y, si esa hora está completa, se proponen las
// horas libres más cercanas para que el cliente no se vaya sin reservar.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  disponibilidadPublica,
  proximasFechasLibres,
  reservarPublica,
  type ResultadoReservaWeb,
} from "./actions";
import type { SlotDisponibilidad } from "@/lib/reservas/disponibilidad";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Hasta cuántos días vista se puede reservar online.
const DIAS_VISTA = 60;

const isoDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function fechaLarga(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const dia = new Date(y, m - 1, d).getDay();
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`;
}

const aMin = (h: string) => {
  const [H, M] = h.split(":").map(Number);
  return H * 60 + M;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const estaLibre = (s: SlotDisponibilidad) => s.estado === "libre" || s.estado === "pocas";

// Etiqueta de campo, en versalitas finas (registro editorial).
const CLASE_ETIQUETA = "text-[10.5px] font-semibold tracking-[0.14em] text-ink-soft uppercase";
// Controles de formulario: línea fina, esquinas discretas.
const CLASE_CONTROL =
  "w-full rounded-[6px] border border-ink/20 bg-white px-3.5 py-2.5 text-[14.5px] text-ink outline-none transition-colors focus:border-ink";

// ── Calendario mensual (lunes primero, ventana hoy → hoy+60 días) ──────
function Calendario({
  fecha,
  onFecha,
  diasCierre,
}: {
  fecha: string;
  onFecha: (v: string) => void;
  diasCierre: number[];
}) {
  const hoy = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const max = useMemo(() => {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + DIAS_VISTA);
    return d;
  }, [hoy]);

  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));

  const primeraCelda = (mes.getDay() + 6) % 7; // lunes = 0
  const diasEnMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const puedeAtras = mes.getTime() > new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
  const puedeAdelante = new Date(mes.getFullYear(), mes.getMonth() + 1, 1).getTime() <= max.getTime();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!puedeAtras}
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
          aria-label="Mes anterior"
          className="grid size-8 cursor-pointer place-items-center rounded-[6px] border border-ink/15 text-ink transition-colors hover:border-ink disabled:cursor-default disabled:opacity-25"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="font-[Georgia,'Times_New_Roman',serif] text-[16px] text-ink">
          {MESES_LARGOS[mes.getMonth()]} {mes.getFullYear()}
        </div>
        <button
          type="button"
          disabled={!puedeAdelante}
          onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
          aria-label="Mes siguiente"
          className="grid size-8 cursor-pointer place-items-center rounded-[6px] border border-ink/15 text-ink transition-colors hover:border-ink disabled:cursor-default disabled:opacity-25"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <span key={d} className="grid h-8 place-items-center text-[10.5px] font-semibold tracking-wider text-ink-soft">
            {d}
          </span>
        ))}
        {Array.from({ length: primeraCelda }, (_, i) => (
          <span key={`v${i}`} />
        ))}
        {Array.from({ length: diasEnMes }, (_, i) => {
          const d = new Date(mes.getFullYear(), mes.getMonth(), i + 1);
          const valor = isoDe(d);
          const fuera =
            d.getTime() < hoy.getTime() || d.getTime() > max.getTime() || diasCierre.includes(d.getDay());
          const activo = valor === fecha;
          const esHoy = d.getTime() === hoy.getTime();
          return (
            <button
              key={valor}
              type="button"
              disabled={fuera}
              onClick={() => onFecha(valor)}
              className={cn(
                "grid h-9 cursor-pointer place-items-center rounded-[6px] border text-[13px] tabular-nums transition-colors",
                activo
                  ? "border-ink bg-ink font-semibold text-white"
                  : fuera
                    ? "cursor-default border-transparent text-ink/25"
                    : cn("border-transparent text-ink hover:border-ink", esHoy && "border-ink/30"),
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReservarWidget({
  nombreLocal,
  telefono,
  mapsUrl,
  diasCierre = [],
}: {
  nombreLocal: string;
  telefono: string;
  mapsUrl: string;
  diasCierre?: number[];
}) {
  // Arrancar en el primer día ABIERTO (si hoy es día de cierre, saltarlo).
  const hoyISO = useMemo(() => {
    const d = new Date();
    for (let i = 0; i < 7 && diasCierre.includes(d.getDay()); i++) d.setDate(d.getDate() + 1);
    return isoDe(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [paso, setPaso] = useState<"reserva" | "cliente">("reserva");
  const [pax, setPax] = useState(2);
  const [fecha, setFecha] = useState(hoyISO);
  const [hora, setHora] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotDisponibilidad[] | null>(null);
  const [cargando, setCargando] = useState(false);

  // Aviso de hora completa + alternativas libres más cercanas (mismo día) y,
  // si el día entero está lleno, próximas fechas con hueco.
  const [horaOcupada, setHoraOcupada] = useState<string | null>(null);
  const [alternativas, setAlternativas] = useState<SlotDisponibilidad[] | null>(null);
  const [otrasFechas, setOtrasFechas] = useState<{ fecha: string; hora: string }[] | null>(null);
  const [comprobando, startComprobar] = useTransition();

  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [companyia, setCompanyia] = useState(""); // honeypot

  const [enviando, startEnvio] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<ResultadoReservaWeb | null>(null);

  // En móvil, al saltar de paso el viewport se quedaba a media página y el
  // formulario aparecía "cortado": subir la tarjeta al cambiar de paso o al
  // confirmar (nunca en el primer render).
  const tarjetaRef = useRef<HTMLElement>(null);
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    tarjetaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [paso, hecho]);

  // La parrilla de horas del día (turnos). Se pinta SIN estados de ocupación:
  // todas elegibles; la comprobación real llega al pulsar Continuar. Este efecto
  // SOLO recarga slots — no toca la selección, para poder saltar a otra fecha
  // (cross-selling) llevándonos la hora ya elegida.
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    disponibilidadPublica(fecha, pax)
      .then((res) => vivo && setSlots(res.ok ? (res.slots ?? []) : []))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [fecha, pax]);

  // Cambiar fecha o grupo A MANO invalida la selección y los avisos.
  function limpiarSeleccion() {
    setHora(null);
    setHoraOcupada(null);
    setAlternativas(null);
    setOtrasFechas(null);
  }

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
      // Día entero sin hueco → ofrecer las próximas fechas libres (no perder
      // la reserva). otrasFechas = null mientras busca (muestra "Buscando…").
      if (cercanas.length === 0) {
        setOtrasFechas(null);
        const otras = await proximasFechasLibres(fecha, pax);
        setOtrasFechas(otras.ok ? (otras.fechas ?? []) : []);
      }
    });
  }

  // Alternativa del MISMO día: solo cambia la hora.
  function elegirAlternativa(h: string) {
    setHora(h);
    setHoraOcupada(null);
    setAlternativas(null);
    setOtrasFechas(null);
    setPaso("cliente");
  }

  // Alternativa de OTRO día: cambia fecha + hora y salta a datos. El efecto
  // recargará los slots de esa fecha, pero ya no borra la hora (ver arriba).
  function elegirOtraFecha(f: string, h: string) {
    setFecha(f);
    setHora(h);
    setHoraOcupada(null);
    setAlternativas(null);
    setOtrasFechas(null);
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
      <section ref={tarjetaRef} className="anim-in w-full scroll-mt-4 rounded-[10px] bg-white/[.97] p-8 text-center shadow-xl backdrop-blur-sm md:p-10">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-ink/20 text-ink">
          <Check className="size-5" />
        </div>
        <h2 className="mt-5 font-[Georgia,'Times_New_Roman',serif] text-[26px] font-normal tracking-tight text-ink">
          La reserva está confirmada.
        </h2>
        <p className="mt-1.5 text-[13.5px] text-ink-soft">Te esperamos, {nombre.split(" ")[0]}.</p>

        <div className="mx-auto mt-6 w-full max-w-sm border-y border-ink/10 text-left">
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

        <div className="mx-auto mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
          <a
            href={calUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-[6px] bg-ink px-4 py-3 text-[12.5px] font-semibold tracking-[0.08em] text-white uppercase transition-colors hover:bg-black"
          >
            <CalendarCheck className="size-4" /> Calendario
          </a>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-[6px] border border-ink/25 bg-white px-4 py-3 text-[12.5px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:border-ink"
          >
            <MapPin className="size-4" /> Cómo llegar
          </a>
        </div>
      </section>
    );
  }

  // ── Motor en dos pasos ──
  return (
    <section ref={tarjetaRef} className="anim-in w-full scroll-mt-4 rounded-[10px] bg-white/[.97] p-7 shadow-xl backdrop-blur-sm md:p-9">
      {/* Migas de paso: 1. Reserva → 2. Cliente */}
      <div className="mb-7 flex items-center gap-4 border-b border-ink/10 pb-3">
        <button
          type="button"
          onClick={() => setPaso("reserva")}
          className={cn(
            "-mb-[13px] cursor-pointer border-b pb-3 text-[13px] tracking-[0.02em] transition-colors",
            paso === "reserva"
              ? "border-ink font-semibold text-ink"
              : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          1 · Reserva
        </button>
        <span
          className={cn(
            "-mb-[13px] border-b pb-3 text-[13px] tracking-[0.02em]",
            paso === "cliente" ? "border-ink font-semibold text-ink" : "border-transparent text-ink-soft",
          )}
        >
          2 · Cliente
        </span>
      </div>

      {paso === "reserva" ? (
        <div className="grid gap-8 md:grid-cols-[300px_minmax(0,1fr)]">
          {/* Calendario mensual */}
          <div className="md:border-r md:border-ink/10 md:pr-8">
            <div className={cn(CLASE_ETIQUETA, "mb-3")}>Fecha</div>
            <Calendario
              fecha={fecha}
              diasCierre={diasCierre}
              onFecha={(v) => {
                setFecha(v);
                limpiarSeleccion();
              }}
            />
          </div>

          {/* Personas + horas */}
          <div>
            <label className="mb-5 block max-w-[220px]">
              <span className={cn(CLASE_ETIQUETA, "mb-1.5 block")}>Comensales</span>
              <select
                value={pax}
                onChange={(e) => {
                  setPax(Number(e.target.value));
                  limpiarSeleccion();
                }}
                className={cn(CLASE_CONTROL, "cursor-pointer")}
              >
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "persona" : "personas"}
                  </option>
                ))}
              </select>
            </label>

            {/* Parrilla de horas: TODAS elegibles (la disponibilidad se
                comprueba al continuar, para no perder la reserva de entrada) */}
            <div className={cn(CLASE_ETIQUETA, "mb-2.5")}>Horarios · {fechaLarga(fecha)}</div>

            {cargando && (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-[6px] bg-ink/5" />
                ))}
              </div>
            )}

            {slots !== null && slots.length === 0 && !cargando && (
              <p className="rounded-[6px] border border-ink/10 bg-ink/[.03] px-3.5 py-3 text-[13px] text-ink-soft">
                No hay horario de reservas para este día. Prueba con otra fecha o llámanos
                {telefono ? ` al ${telefono}` : ""}.
              </p>
            )}

            {!cargando &&
              servicios.map((servicio) => (
                <div key={servicio} className="mb-4 last:mb-0">
                  <div className="mb-2 text-[13px] font-medium text-ink-soft">{servicio}</div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
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
                            setOtrasFechas(null);
                          }}
                          className={cn(
                            "cursor-pointer rounded-[6px] border py-2.5 text-[13.5px] font-medium tabular-nums transition-colors",
                            hora === s.hora
                              ? "border-ink bg-ink text-white"
                              : "border-ink/20 bg-white text-ink hover:border-ink",
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
              <div className="anim-in mt-5 rounded-[6px] border border-[#E3D9C2] bg-[#FBF7EC] p-4">
                <p className="text-[13.5px] font-semibold text-[#5C4A17]">
                  A las {horaOcupada} estamos completos para {pax}{" "}
                  {pax === 1 ? "persona" : "personas"}.
                </p>
                {alternativas.length > 0 ? (
                  <>
                    <p className="mt-0.5 mb-3 text-[13px] text-[#5C4A17]">
                      Estas horas sí están disponibles — elige una y continúa:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {alternativas.map((s) => (
                        <button
                          key={s.hora}
                          type="button"
                          onClick={() => elegirAlternativa(s.hora)}
                          className="cursor-pointer rounded-[6px] border border-ink/25 bg-white px-4 py-2 text-[13.5px] font-medium tabular-nums text-ink transition-colors hover:bg-ink hover:text-white"
                        >
                          {s.hora}
                        </button>
                      ))}
                    </div>
                  </>
                ) : otrasFechas === null ? (
                  <p className="mt-1 text-[13px] text-[#5C4A17]">Buscando huecos en los próximos días…</p>
                ) : otrasFechas.length > 0 ? (
                  <>
                    <p className="mt-0.5 mb-3 text-[13px] text-[#5C4A17]">
                      Ese día está completo, pero tenemos mesa estos días — elige y continúa:
                    </p>
                    <div className="flex flex-col gap-2">
                      {otrasFechas.map((o) => (
                        <button
                          key={o.fecha}
                          type="button"
                          onClick={() => elegirOtraFecha(o.fecha, o.hora)}
                          className="flex cursor-pointer items-center justify-between gap-3 rounded-[6px] border border-ink/25 bg-white px-4 py-2.5 text-[13.5px] font-medium text-ink transition-colors hover:bg-ink hover:text-white"
                        >
                          <span>{cap(fechaLarga(o.fecha))}</span>
                          <span className="tabular-nums opacity-80">desde las {o.hora}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-0.5 text-[13px] text-[#5C4A17]">
                    No encontramos hueco próximo para {pax} {pax === 1 ? "persona" : "personas"}.
                    {telefono ? ` Llámanos al ${telefono} y lo miramos contigo.` : ""}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={continuar}
              disabled={!hora || comprobando || cargando}
              className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[6px] bg-ink px-5 py-3.5 text-[12.5px] font-semibold tracking-[0.12em] text-white uppercase transition-colors hover:bg-black disabled:cursor-default disabled:opacity-30"
            >
              {comprobando ? "Comprobando…" : "Continuar"}
              {!comprobando && <ChevronRight className="size-4" />}
            </button>

            {telefono && (
              <p className="mt-3 text-center text-[12px] text-ink-soft">
                Para grupos de más de 20 personas, llámanos al{" "}
                <a href={`tel:${telefono.replace(/\s/g, "")}`} className="font-medium text-ink underline-offset-4 hover:underline">
                  {telefono}
                </a>
                .
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <h2 className="mb-2 font-[Georgia,'Times_New_Roman',serif] text-[22px] font-normal tracking-tight text-ink">
            Tus datos
          </h2>

          {/* Resumen de lo elegido */}
          <p className="mb-5 border-b border-ink/10 pb-4 text-[13.5px] text-ink-soft">
            {fechaLarga(fecha)} · <b className="font-semibold text-ink">{hora}</b> · {pax}{" "}
            {pax === 1 ? "persona" : "personas"}
            {slotElegido ? ` · mesa hasta las ${slotElegido.hastaHora}` : ""}
          </p>

          <div className="flex flex-col gap-3">
            <label className="block">
              <span className={cn(CLASE_ETIQUETA, "mb-1.5 block")}>Nombre y apellido *</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoComplete="name"
                className={CLASE_CONTROL}
              />
            </label>
            <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
              <label className="block">
                <span className={cn(CLASE_ETIQUETA, "mb-1.5 block")}>Teléfono</span>
                <input
                  value={tel}
                  onChange={(e) => setTel(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  className={CLASE_CONTROL}
                />
              </label>
              <label className="block">
                <span className={cn(CLASE_ETIQUETA, "mb-1.5 block")}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className={CLASE_CONTROL}
                />
              </label>
            </div>
            <label className="block">
              <span className={cn(CLASE_ETIQUETA, "mb-1.5 block")}>Notas (opcional)</span>
              <input
                placeholder="Alergias, trona, celebración…"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className={CLASE_CONTROL}
              />
            </label>
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

          <p className="mt-2.5 text-[11.5px] text-ink-soft">
            Déjanos al menos un teléfono o un email para confirmarte la reserva.
          </p>

          {error && (
            <p className="mt-3 rounded-[6px] border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-[13px] font-medium text-bad">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={() => setPaso("reserva")}
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border border-ink/25 bg-white px-4 py-3.5 text-[12.5px] font-semibold tracking-[0.08em] text-ink uppercase transition-colors hover:border-ink"
            >
              <ArrowLeft className="size-4" /> Volver
            </button>
            <button
              onClick={confirmar}
              disabled={enviando || !nombre.trim() || (!tel.trim() && !email.trim())}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[6px] bg-ink px-5 py-3.5 text-[12.5px] font-semibold tracking-[0.12em] text-white uppercase transition-colors hover:bg-black disabled:cursor-default disabled:opacity-30"
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

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-ink/10 py-2.5 last:border-none">
      <span className="text-[10.5px] font-semibold tracking-[0.14em] text-ink-soft uppercase">{etiqueta}</span>
      <b className="text-[13.5px] font-semibold text-ink">{valor}</b>
    </div>
  );
}
