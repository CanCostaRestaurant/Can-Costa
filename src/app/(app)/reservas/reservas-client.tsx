"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Phone, Settings2, Sparkles, Users } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { type DiaReservas, type ReservaDia } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import {
  cambiarEstadoReserva,
  crearReserva,
  marcarConfirmadaCliente,
  reasignarMesa,
  reoptimizarDia,
  sentarReserva,
} from "./actions";
import { SelectorHoras } from "./selector-horas";

const ZONAS = [
  { id: "", nombre: "Sin preferencia" },
  { id: "sala", nombre: "Sala" },
  { id: "terraza", nombre: "Terraza" },
  { id: "barra", nombre: "Barra" },
] as const;

export function ReservasClient({ datos, hoy }: { datos: DiaReservas; hoy: string }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Formulario nueva reserva
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [hora, setHora] = useState("21:00");
  const [pax, setPax] = useState("2");
  const [zona, setZona] = useState<string>("");
  const [notas, setNotas] = useState("");

  const activas = datos.reservas.filter((r) => r.estado === "confirmada" || r.estado === "sentada");

  function cambiarDia(dia: string) {
    router.push(dia === hoy ? "/reservas" : `/reservas?dia=${dia}`);
  }

  function ejecutar(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    mensaje?: (r: Awaited<ReturnType<typeof fn>>) => string | null,
  ) {
    setError(null);
    setAviso(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      if (mensaje) setAviso(mensaje(res));
      router.refresh();
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Reservas"
        subtitulo="Cover manager: cada reserva con la mejor mesa posible"
        derecha={
          <div className="flex items-center gap-2">
            <Link
              href="/reservas/ajustes"
              title="Ajustes: doblaje, turnos y cupos"
              className="card flex cursor-pointer items-center gap-2 rounded-full! px-3.5 py-2 text-[13.5px] font-semibold transition-colors hover:border-brand"
            >
              <Settings2 className="size-4 text-ink-soft" /> Ajustes
            </Link>
            <button
              onClick={() =>
                ejecutar(
                  () => reoptimizarDia(datos.fecha),
                  (r) => {
                    const x = r as { asignadas?: number; sinMesa?: number };
                    return `Mesas repartidas de nuevo: ${x.asignadas ?? 0} asignadas${x.sinMesa ? `, ${x.sinMesa} sin hueco` : ""}`;
                  },
                )
              }
              disabled={ocupado}
              className="card flex cursor-pointer items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
            >
              <Sparkles className="size-4 text-brand" /> Reoptimizar mesas
            </button>
            <DatePicker
              value={datos.fecha}
              align="right"
              onChange={(v) => v && cambiarDia(v)}
            />
          </div>
        }
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}
      {aviso && (
        <div className="mb-3.5 rounded-[14px] bg-good-soft px-4 py-3 text-[13.5px] font-semibold text-good">
          {aviso}
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
        <Kpi etiqueta="Reservas" valor={String(activas.length)}>
          {datos.fecha === hoy ? "para hoy" : "este día"}
        </Kpi>
        <Kpi etiqueta="Comensales" valor={String(datos.totalComensales)}>
          de {datos.plazasTotales} plazas totales
        </Kpi>
        <Kpi
          etiqueta="Sin mesa"
          valor={String(datos.sinMesa)}
          valorClase={datos.sinMesa > 0 ? "text-bad" : "text-good"}
        >
          {datos.sinMesa > 0 ? "usa reoptimizar o reasigna" : "todo asignado"}
        </Kpi>
        <Kpi
          etiqueta="Ocupación"
          valor={datos.plazasTotales > 0 ? `${Math.round((datos.totalComensales / datos.plazasTotales) * 100)}%` : "—"}
        >
          comensales / plazas
        </Kpi>
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        {/* ── Lista del día ── */}
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
            Libro de reservas
          </div>
          {datos.reservas.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-ink-soft">
              Sin reservas este día. Crea la primera con el formulario.
            </p>
          )}
          {datos.reservas.map((r) => (
            <FilaReserva key={r.id} reserva={r} mesas={datos.mesas} ocupado={ocupado} onEjecutar={ejecutar} />
          ))}
        </div>

        {/* ── Nueva reserva ── */}
        <div className="card p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold tracking-tight">
            <CalendarDays className="size-[18px] text-ink-soft" /> Nueva reserva
          </h3>
          <div className="flex flex-col gap-3">
            <input
              placeholder="Nombre *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[14.5px] outline-none focus:border-brand"
            />
            <input
              placeholder="Teléfono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[14.5px] outline-none focus:border-brand"
            />
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[14.5px] outline-none focus:border-brand"
            />
            <label className="w-28 text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Comensales
              <input
                type="number"
                min="1"
                max="40"
                value={pax}
                onChange={(e) => setPax(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
              />
            </label>
            <SelectorHoras
              fecha={datos.fecha}
              pax={parseInt(pax, 10) || 0}
              hora={hora}
              onHora={setHora}
            />
            <label className="text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Zona preferida
              <select
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
              >
                {ZONAS.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </select>
            </label>
            <input
              placeholder="Notas (alergias, trona, celebración…)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="rounded-xl border border-line bg-card px-3.5 py-2.5 text-[14.5px] outline-none focus:border-brand"
            />
            {(() => {
              const guardar = (notificar: boolean) =>
                ejecutar(
                  () =>
                    crearReserva({
                      nombre,
                      telefono,
                      email,
                      fecha: datos.fecha,
                      hora,
                      comensales: parseInt(pax, 10),
                      zonaPreferida: (zona || null) as "sala" | "terraza" | "barra" | null,
                      notas,
                      notificar: notificar
                        ? { email: Boolean(email.trim()), sms: Boolean(telefono.trim()) }
                        : undefined,
                    }),
                  (r) => {
                    const x = r as {
                      mesaNombre?: string | null;
                      motivo?: string;
                      cliente?: string | null;
                      notificacion?: string | null;
                    };
                    setNombre("");
                    setTelefono("");
                    setEmail("");
                    setNotas("");
                    const base = x.mesaNombre
                      ? `Asignada ${x.mesaNombre} — ${x.motivo}`
                      : `Reserva creada SIN MESA — ${x.motivo}`;
                    return [base, x.cliente, x.notificacion].filter(Boolean).join(" · ");
                  },
                );
              const hayContacto = Boolean(email.trim() || telefono.trim());
              return (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => guardar(true)}
                    disabled={!nombre.trim() || !hayContacto || ocupado}
                    title={hayContacto ? "Envía la confirmación por los canales con datos (email/SMS)" : "Añade email o teléfono para poder notificar"}
                    className="cursor-pointer rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
                  >
                    {ocupado ? "Guardando…" : "Reservar y notificar al cliente"}
                  </button>
                  <button
                    onClick={() => guardar(false)}
                    disabled={!nombre.trim() || ocupado}
                    className="cursor-pointer rounded-xl border border-line bg-card px-5 py-2.5 text-[13.5px] font-semibold transition-colors hover:border-brand disabled:opacity-40"
                  >
                    Solo reservar
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </section>
  );
}

function FilaReserva({
  reserva: r,
  mesas,
  ocupado,
  onEjecutar,
}: {
  reserva: ReservaDia;
  mesas: DiaReservas["mesas"];
  ocupado: boolean;
  onEjecutar: (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    mensaje?: (res: { ok: boolean }) => string | null,
  ) => void;
}) {
  const router = useRouter();
  const terminal = r.estado === "cancelada" || r.estado === "no_show";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-none", terminal && "opacity-45")}>
      <b className="w-14 shrink-0 font-display text-lg font-bold tracking-tight">{r.hora}</b>
      <div className="min-w-32 flex-1">
        <b
          className="block truncate text-sm font-semibold"
          title={r.notas ? `${r.nombre} · ${r.notas}` : r.nombre}
        >
          {r.nombre}
          {r.origen === "web" && <Chip tone="good" className="ml-2 align-middle">web</Chip>}
          {r.notas && <span className="ml-2 font-normal text-ink-soft">· {r.notas}</span>}
        </b>
        <small className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          {!terminal && (
            <BadgeConfirmacion
              confirmada={r.confirmadaCliente}
              recordado={r.recordado}
              ocupado={ocupado}
              onToggle={() => onEjecutar(() => marcarConfirmadaCliente(r.id, !r.confirmadaCliente))}
            />
          )}
          <span className="flex items-center gap-1">
            <Users className="size-3" /> {r.comensales}
          </span>
          {r.telefono && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Phone className="size-3" /> {r.telefono}
            </span>
          )}
          {r.zonaPreferida && <span className="whitespace-nowrap">prefiere {r.zonaPreferida}</span>}
        </small>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
      {!terminal && (
        <span className="flex items-center gap-1.5">
          <select
            value={r.mesaId ?? ""}
            onChange={(e) =>
              onEjecutar(() => reasignarMesa(r.id, e.target.value === "auto" ? "auto" : e.target.value || null))
            }
            disabled={ocupado || r.estado === "sentada"}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-brand",
              r.mesaId ? "border-line bg-card" : "border-bad bg-bad-soft text-bad",
            )}
          >
            <option value="">⚠ sin mesa</option>
            <option value="auto">✨ auto</option>
            {mesas
              .filter((m) => m.capacidad >= r.comensales || m.id === r.mesaId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.capacidad})
                </option>
              ))}
          </select>
          {r.mesa2Nombre && <Chip tone="warn">+ {r.mesa2Nombre} juntas</Chip>}
        </span>
      )}

      {r.estado === "confirmada" && (
        <>
          <button
            onClick={() =>
              onEjecutar(
                async () => {
                  const res = await sentarReserva(r.id);
                  if (res.ok && res.ticketId) router.push(`/tpv?ticket=${res.ticketId}`);
                  return res;
                },
              )
            }
            disabled={ocupado || !r.mesaId}
            className="cursor-pointer rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
          >
            Sentar
          </button>
          <button
            onClick={() => onEjecutar(() => cambiarEstadoReserva(r.id, "no_show"))}
            disabled={ocupado}
            title="No se ha presentado"
            className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft hover:border-warn hover:text-warn"
          >
            No-show
          </button>
          <button
            onClick={() => onEjecutar(() => cambiarEstadoReserva(r.id, "cancelada"))}
            disabled={ocupado}
            className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft hover:border-bad hover:text-bad"
          >
            Cancelar
          </button>
        </>
      )}
      {r.estado === "sentada" && <Chip tone="good" dot>Sentada</Chip>}
      {r.estado === "no_show" && <Chip tone="warn">No-show</Chip>}
      {r.estado === "cancelada" && <Chip tone="gray">Cancelada</Chip>}
      {terminal && (
        <button
          onClick={() => onEjecutar(() => cambiarEstadoReserva(r.id, "confirmada"))}
          disabled={ocupado}
          className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft hover:border-good hover:text-good"
        >
          Recuperar
        </button>
      )}
      </div>
    </div>
  );
}

// Estado de confirmación del cliente (verde = confirmada por WhatsApp/a mano;
// ámbar = recordatorio enviado y sin respuesta; gris = aún sin pedir). Clic
// para marcar/quitar a mano (por teléfono, o antes de tener WhatsApp).
function BadgeConfirmacion({
  confirmada,
  recordado,
  ocupado,
  onToggle,
}: {
  confirmada: boolean;
  recordado: boolean;
  ocupado: boolean;
  onToggle: () => void;
}) {
  const tono = confirmada ? "good" : recordado ? "warn" : "gray";
  const texto = confirmada ? "✓ Confirmada" : recordado ? "Pendiente confirmar" : "Sin confirmar";
  const TONOS: Record<string, string> = {
    good: "bg-good-soft text-good hover:brightness-95",
    warn: "bg-warn-soft text-warn hover:brightness-95",
    gray: "bg-chip text-ink-soft hover:text-ink",
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={ocupado}
      title={confirmada ? "Confirmada por el cliente — clic para quitar" : "Marcar como confirmada por el cliente"}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center rounded-full px-2.5 py-0.5 align-middle text-xs font-semibold transition disabled:opacity-50",
        TONOS[tono],
      )}
    >
      {texto}
    </button>
  );
}

function Kpi({
  etiqueta,
  valor,
  valorClase,
  children,
}: {
  etiqueta: string;
  valor: string;
  valorClase?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className={cn("mt-1.5 font-display text-[28px] font-bold tracking-tight", valorClase)}>{valor}</div>
      <div className="mt-1 text-[12.5px] text-ink-soft">{children}</div>
    </div>
  );
}
