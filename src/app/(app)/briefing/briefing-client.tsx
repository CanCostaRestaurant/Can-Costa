"use client";

// Briefing diario (reunión pre-servicio), versión digital de la hoja de papel.
// La mitad se rellena SOLA con el CRM: ocupación y grupos desde Reservas
// (con alergias de la ficha del cliente), agotados/pocas unidades desde el
// Inventario, y "qué lleva cada plato" desde los escandallos. El resto
// (equipo, objetivos, motivación…) se edita aquí y se guarda por día.
// El modo tablet (camareros) lo lee; imprimible en A4 para colgarlo.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChefHat,
  ClipboardList,
  Megaphone,
  Printer,
  Save,
  Search,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { DatePicker } from "@/components/date-picker";
import { type BriefingDia, type FichaPlato } from "@/lib/db/queries";
import { type DatosBriefing } from "@/lib/briefing/tipos";
import { cn, eur } from "@/lib/utils";
import { guardarBriefing } from "./actions";

const TIPO_ORDEN: Record<FichaPlato["tipo"], number> = { entrante: 0, principal: 1, postre: 2, bebida: 3, otro: 4 };
const TIPO_NOMBRE: Record<FichaPlato["tipo"], string> = {
  entrante: "Entrantes",
  principal: "Principales",
  postre: "Postres",
  bebida: "Bebidas",
  otro: "Otros",
};

function sinAcentos(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function BriefingClient({
  dia,
  inicial,
  existia,
  hoy,
  puedeEditar,
  cargaDegradada,
}: {
  dia: BriefingDia;
  inicial: DatosBriefing;
  existia: boolean;
  hoy: string;
  puedeEditar: boolean;
  cargaDegradada: boolean;
}) {
  const router = useRouter();
  const [d, setD] = useState<DatosBriefing>(inicial);
  const [sucio, setSucio] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, start] = useTransition();
  const [busqueda, setBusqueda] = useState("");

  function campo<K extends keyof DatosBriefing>(clave: K, valor: DatosBriefing[K]) {
    setD((prev) => ({ ...prev, [clave]: valor }));
    setSucio(true);
    setGuardado(false);
  }

  function guardar() {
    setError(null);
    start(async () => {
      const res = await guardarBriefing(dia.fecha, d);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      setSucio(false);
      setGuardado(true);
      router.refresh();
    });
  }

  const fichasDia = dia.fichas.filter((f) => d.platosDia.includes(f.id));
  const fichasFiltradas = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    const lista = q ? dia.fichas.filter((f) => sinAcentos(f.nombre).includes(q)) : dia.fichas;
    return [...lista].sort((a, b) => TIPO_ORDEN[a.tipo] - TIPO_ORDEN[b.tipo] || a.nombre.localeCompare(b.nombre));
  }, [dia.fichas, busqueda]);

  return (
    <section className="anim-in">
      {/* El CSS global de impresión es del ticket térmico (80mm): esta página
          declara su propia @page A4 — al ir después en el DOM gana la cascada,
          y cubre tanto el botón Imprimir como un Ctrl+P directo. */}
      <style>{"@media print { @page { size: A4; margin: 10mm; } }"}</style>
      <PageHead
        titulo="Briefing del día"
        subtitulo={`Reunión pre-servicio · ${dia.fechaLegible}`}
        derecha={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <DatePicker
              value={dia.fecha}
              align="right"
              onChange={(v) => v && router.push(v === hoy ? "/briefing" : `/briefing?dia=${v}`)}
            />
            <button
              onClick={() => window.print()}
              className="card flex cursor-pointer items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold"
            >
              <Printer className="size-4 text-ink-soft" /> Imprimir
            </button>
            {puedeEditar && (
              <button
                onClick={guardar}
                disabled={ocupado || !sucio}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-semibold text-white transition-colors disabled:opacity-40",
                  guardado && !sucio ? "bg-good" : "bg-ink hover:bg-black",
                )}
              >
                {guardado && !sucio ? <Check className="size-4" /> : <Save className="size-4" />}
                {ocupado ? "Guardando…" : guardado && !sucio ? "Guardado" : "Guardar"}
              </button>
            )}
          </div>
        }
      />

      {cargaDegradada && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad print:hidden">
          La base de datos no responde: lo que ves puede estar incompleto y el guardado está bloqueado para no pisar el
          briefing real. Recarga en un momento.
        </div>
      )}
      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad print:hidden">
          {error}
        </div>
      )}
      {!existia && puedeEditar && !cargaDegradada && (
        <div className="mb-3.5 rounded-[14px] bg-warn-soft px-4 py-3 text-[13px] font-semibold text-[#7A5106] print:hidden">
          El briefing de este día aún no está guardado: rellena y pulsa Guardar. Ocupación, agotados y fichas de platos
          salen solos del CRM.
        </div>
      )}
      {dia.guardadoPor && (
        <p className="mb-3.5 text-[12px] text-ink-soft print:hidden">
          Última edición: {dia.guardadoPor} · {dia.guardadoEl}
        </p>
      )}

      {/* ── Responsable + Ocupación (AUTO) ── */}
      <div className="mb-3.5 grid grid-cols-4 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        <div className="card p-4">
          <div className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">Dirige la reunión</div>
          {puedeEditar ? (
            <input
              value={d.responsable}
              onChange={(e) => campo("responsable", e.target.value)}
              placeholder="Nombre…"
              className="mt-1 w-full border-b border-line bg-transparent pb-1 font-display text-[18px] font-bold tracking-tight outline-none focus:border-brand"
            />
          ) : (
            <div className="mt-0.5 font-display text-[22px] font-bold tracking-tight">{d.responsable || "—"}</div>
          )}
        </div>
        <Kpi
          etiqueta="Reservas comida"
          valor={`${dia.reservas.comidaPax} pax`}
          detalle={`${dia.reservas.total} reservas en total`}
        />
        <Kpi etiqueta="Reservas cena" valor={`${dia.reservas.cenaPax} pax`} detalle="actualizado en vivo" />
        <Kpi
          etiqueta="Grupos y avisos"
          valor={String(dia.reservas.grupos.length)}
          detalle="grandes, con notas o alergias"
          tono={dia.reservas.grupos.length > 0 ? "warn" : "good"}
        />
      </div>

      {/* ── Grupos grandes / avisos de reservas (AUTO) ── */}
      {dia.reservas.grupos.length > 0 && (
        <div className="card mb-3.5 p-4">
          <h3 className="mb-2 flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
            <CalendarDays className="size-4 text-ink-soft" /> Grupos y avisos de hoy
            <span className="font-body text-[12px] font-normal text-ink-soft">de las reservas — automático</span>
          </h3>
          <div className="flex flex-col gap-1.5">
            {dia.reservas.grupos.map((g, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13px]">
                <b className="font-display text-[14px] font-bold">{g.hora}</b>
                <span className="font-semibold">{g.nombre}</span>
                <span className="flex items-center gap-1 text-ink-soft">
                  <Users className="size-3.5" /> {g.comensales}
                </span>
                {g.restricciones && (
                  <Chip tone="bad">
                    <TriangleAlert className="size-3" /> {g.restricciones}
                  </Chip>
                )}
                {g.notas && <span className="text-ink-soft">· {g.notas}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Agotados / pocas unidades (AUTO desde inventario) ── */}
      <div className="card mb-3.5 p-4">
        <h3 className="mb-2 flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
          <TriangleAlert className="size-4 text-ink-soft" /> Agotados y pocas unidades
          <span className="font-body text-[12px] font-normal text-ink-soft">del inventario — automático</span>
        </h3>
        {dia.stock.agotados.length === 0 && dia.stock.pocos.length === 0 ? (
          <p className="text-[13px] text-ink-soft">Sin alertas de stock ahora mismo. 👌</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {dia.stock.agotados.map((n) => (
              <Chip key={n} tone="bad">
                <TriangleAlert className="size-3" /> {n} — agotado
              </Chip>
            ))}
            {dia.stock.pocos.map((p) => (
              <Chip key={p.nombre} tone="warn">
                {p.nombre}
                {p.cobertura !== null ? ` — ${p.cobertura.toFixed(1).replace(".", ",")} días` : ""}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* ── Platos del día + recomendaciones ── */}
      <div className="card mb-3.5 p-4">
        <h3 className="mb-2 flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
          <Sparkles className="size-4 text-ink-soft" /> Platos del día y recomendaciones
        </h3>
        {puedeEditar && (
          <div className="mb-3 flex flex-wrap gap-1.5 print:hidden">
            {dia.fichas.map((f) => (
              <button
                key={f.id}
                onClick={() =>
                  campo(
                    "platosDia",
                    d.platosDia.includes(f.id) ? d.platosDia.filter((x) => x !== f.id) : [...d.platosDia, f.id],
                  )
                }
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  d.platosDia.includes(f.id) ? "bg-ink text-white" : "bg-chip text-ink-soft hover:text-ink",
                )}
              >
                {f.emoji} {f.nombre}
              </button>
            ))}
          </div>
        )}
        {fichasDia.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
            {fichasDia.map((f) => (
              <TarjetaPlato key={f.id} f={f} destacada />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-soft">Sin platos destacados hoy{puedeEditar ? " — elígelos arriba" : ""}.</p>
        )}
        <Campo
          etiqueta="Cómo venderlos (argumentos, maridaje, alergias a avisar)"
          valor={d.recomendaciones}
          onCambio={(v) => campo("recomendaciones", v)}
          editable={puedeEditar}
          placeholder="P. ej.: la merluza es de lonja de hoy; sugerir el blanco de la casa…"
        />
      </div>

      {/* ── Objetivos + calidad ── */}
      <div className="mb-3.5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
        <div className="card p-4">
          <h3 className="mb-1.5 flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
            <Megaphone className="size-4 text-ink-soft" /> Objetivos del día
          </h3>
          <Campo
            valor={d.objetivos}
            onCambio={(v) => campo("objetivos", v)}
            editable={puedeEditar}
            placeholder="P. ej.: mínimo 5 tartas de queso por camarero; subir venta un 10%…"
          />
        </div>
        <div className="card p-4">
          <h3 className="mb-1.5 flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
            <ClipboardList className="size-4 text-ink-soft" /> Calidad del servicio
          </h3>
          <Campo valor={d.calidad} onCambio={(v) => campo("calidad", v)} editable={puedeEditar} />
        </div>
      </div>

      {/* ── Equipo del día ── */}
      <div className="card mb-3.5 p-4">
        <h3 className="mb-2 flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
          <Users className="size-4 text-ink-soft" /> Equipo de hoy
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full max-w-2xl border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] tracking-wider text-ink-soft uppercase">
                <th className="py-1.5 pr-3 font-semibold">Puesto</th>
                <th className="py-1.5 pr-3 font-semibold">Comida</th>
                <th className="py-1.5 font-semibold">Cena</th>
              </tr>
            </thead>
            <tbody>
              {d.equipo.map((fila, i) => (
                <tr key={i} className="border-t border-line/70">
                  <td className="py-1 pr-3 font-semibold">{fila.puesto}</td>
                  {(["comida", "cena"] as const).map((turno) => (
                    <td key={turno} className={cn("py-1", turno === "comida" && "pr-3")}>
                      {puedeEditar ? (
                        <input
                          value={fila[turno]}
                          onChange={(e) =>
                            campo(
                              "equipo",
                              d.equipo.map((f, j) => (j === i ? { ...f, [turno]: e.target.value } : f)),
                            )
                          }
                          placeholder="—"
                          aria-label={`${fila.puesto} en ${turno}`}
                          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 outline-none hover:border-line focus:border-brand"
                        />
                      ) : (
                        fila[turno] || "—"
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Estándares + ayer + motivación ── */}
      <div className="mb-3.5 grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
        <div className="card p-4">
          <h3 className="mb-1.5 font-display text-[15px] font-bold tracking-tight">Presentación personal</h3>
          <Campo valor={d.presentacion} onCambio={(v) => campo("presentacion", v)} editable={puedeEditar} />
        </div>
        <div className="card p-4">
          <h3 className="mb-1.5 font-display text-[15px] font-bold tracking-tight">Revisión del espacio</h3>
          <Campo valor={d.espacio} onCambio={(v) => campo("espacio", v)} editable={puedeEditar} />
        </div>
        <div className="card p-4">
          <h3 className="mb-1.5 font-display text-[15px] font-bold tracking-tight">Ayer: lo bueno</h3>
          <Campo
            valor={d.ayerPositivo}
            onCambio={(v) => campo("ayerPositivo", v)}
            editable={puedeEditar}
            placeholder="Comentarios positivos del servicio de ayer…"
          />
        </div>
        <div className="card p-4">
          <h3 className="mb-1.5 font-display text-[15px] font-bold tracking-tight">Ayer: a mejorar</h3>
          <Campo
            valor={d.ayerMejorar}
            onCambio={(v) => campo("ayerMejorar", v)}
            editable={puedeEditar}
            placeholder="Oportunidades de mejora…"
          />
        </div>
        <div className="card p-4">
          <h3 className="mb-1.5 font-display text-[15px] font-bold tracking-tight">Reconocimientos</h3>
          <Campo
            valor={d.reconocimientos}
            onCambio={(v) => campo("reconocimientos", v)}
            editable={puedeEditar}
            placeholder="P. ej.: reconocimiento a Marta por las reseñas de ayer…"
          />
        </div>
        <div className="card p-4">
          <h3 className="mb-1.5 font-display text-[15px] font-bold tracking-tight">Motivación</h3>
          <Campo valor={d.motivacion} onCambio={(v) => campo("motivacion", v)} editable={puedeEditar} />
        </div>
      </div>

      {/* ── La carta por dentro: qué lleva cada plato (AUTO de escandallos) ── */}
      <div className="card p-4 print:hidden">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
            <ChefHat className="size-4 text-ink-soft" /> La carta por dentro
            <span className="font-body text-[12px] font-normal text-ink-soft">
              qué lleva cada plato, de los escandallos — para explicarlo en mesa
            </span>
          </h3>
          <label className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5">
            <Search className="size-3.5 text-ink-soft" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar plato…"
              className="w-36 bg-transparent text-[13px] font-semibold outline-none placeholder:font-normal"
            />
          </label>
        </div>
        {(["entrante", "principal", "postre", "bebida", "otro"] as const).map((tipo) => {
          const deTipo = fichasFiltradas.filter((f) => f.tipo === tipo);
          if (deTipo.length === 0) return null;
          return (
            <div key={tipo} className="mb-3 last:mb-0">
              <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
                {TIPO_NOMBRE[tipo]}
              </div>
              <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
                {deTipo.map((f) => (
                  <TarjetaPlato key={f.id} f={f} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TarjetaPlato({ f, destacada }: { f: FichaPlato; destacada?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", destacada ? "border-brand bg-brand-soft" : "border-line")}>
      <div className="flex items-center justify-between gap-2">
        <b className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">
          <span className="text-[15px]">{f.emoji}</span>
          <span className="truncate">{f.nombre}</span>
        </b>
        {f.pvp !== null && <span className="font-display text-[13px] font-bold whitespace-nowrap">{eur(f.pvp)}</span>}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
        {f.ingredientes.length > 0 ? f.ingredientes.join(" · ") : "Sin escandallo todavía"}
      </p>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambio,
  editable,
  placeholder,
}: {
  etiqueta?: string;
  valor: string;
  onCambio: (v: string) => void;
  editable: boolean;
  placeholder?: string;
}) {
  return (
    <label className="mt-2 block first:mt-0">
      {etiqueta && (
        <span className="mb-1 block text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</span>
      )}
      {editable ? (
        <>
          <textarea
            value={valor}
            onChange={(e) => onCambio(e.target.value)}
            placeholder={placeholder}
            aria-label={etiqueta ?? placeholder ?? "Texto del briefing"}
            rows={Math.max(2, Math.min(4, Math.ceil(valor.length / 70)))}
            className="w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-[13.5px] leading-relaxed outline-none focus:border-brand print:hidden"
          />
          {/* En papel, el texto completo (el textarea recorta lo que no cabe) */}
          <p className="hidden text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink print:block">{valor || "—"}</p>
        </>
      ) : (
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">{valor || "—"}</p>
      )}
    </label>
  );
}

function Kpi({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: "good" | "warn";
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className={cn("mt-0.5 font-display text-[22px] font-bold tracking-tight", tono === "warn" && "text-warn")}>
        {valor}
      </div>
      <div className="mt-0.5 text-[11.5px] text-ink-soft">{detalle}</div>
    </div>
  );
}
