"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileText, Loader2, Paperclip, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { MonthPicker } from "@/components/date-picker";
import { type GastoPersonal, type PersonalMes, type Trabajador } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { TablaDesglosePersonal } from "./tabla-desglose";
import {
  actualizarTrabajador,
  agregarNomina,
  copiarMesAnterior,
  crearTrabajador,
  eliminarGastoPersonal,
  eliminarTrabajador,
  generarNominasDelMes,
  getDocumentoNomina,
  quitarDocumentoNomina,
  subirDocumentoNomina,
} from "./actions";

const TIPOS: { valor: GastoPersonal["tipo"]; etiqueta: string; tono: "good" | "warn" | "gray" }[] = [
  { valor: "nomina", etiqueta: "Nómina", tono: "good" },
  { valor: "seguridad_social", etiqueta: "Seg. Social", tono: "warn" },
  { valor: "otro", etiqueta: "Otro", tono: "gray" },
];

// Abre el PDF/imagen (data URL → blob) en una pestaña nueva.
async function abrirDocumento(id: string): Promise<string | null> {
  const res = await getDocumentoNomina(id);
  if (!res.ok || !res.dataUrl) return res.error ?? "Sin documento";
  const [meta, b64] = res.dataUrl.split(",");
  const mime = meta.match(/data:(.*?);/)?.[1] ?? "application/pdf";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}

export function PersonalClient({ datos, trabajadores }: { datos: PersonalMes; trabajadores: Trabajador[] }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Alta de nómina/gasto
  const [trabajadorId, setTrabajadorId] = useState("");
  const [concepto, setConcepto] = useState("");
  const [tipo, setTipo] = useState<GastoPersonal["tipo"]>("nomina");
  const [importe, setImporte] = useState("");

  function ejecutar(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    mensaje?: (r: { ok: boolean }) => string | null,
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

  const activos = trabajadores.filter((t) => t.activo);

  return (
    <section className="anim-in">
      <PageHead
        titulo="Personal"
        subtitulo="Plantilla y nóminas: gestiona tu equipo y adjunta el PDF de cada nómina"
        derecha={
          <MonthPicker
            value={datos.mes}
            align="right"
            onChange={(v) => v && router.push(`/personal?mes=${v}`)}
          />
        }
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">{error}</div>
      )}
      {aviso && (
        <div className="mb-3.5 rounded-[14px] bg-good-soft px-4 py-3 text-[13.5px] font-semibold text-good">{aviso}</div>
      )}

      <div className="grid grid-cols-[1.6fr_1fr] items-start gap-3.5 max-md:grid-cols-1">
        {/* ── Nóminas del mes ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Nóminas de {datos.mes}
            </span>
            <button
              onClick={() =>
                ejecutar(
                  () => generarNominasDelMes(datos.mes),
                  (r) => {
                    const x = r as { creadas?: number; sinSalario?: number };
                    return `${x.creadas ?? 0} nómina(s) generada(s) desde la plantilla${
                      x.sinSalario ? ` · ${x.sinSalario} sin salario definido` : ""
                    }`;
                  },
                )
              }
              disabled={ocupado || activos.length === 0}
              title={activos.length === 0 ? "Añade trabajadores a la plantilla primero" : "Crear la nómina de cada trabajador activo con su salario"}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-brand disabled:opacity-40"
            >
              <Sparkles className="size-3.5 text-brand" /> Generar del mes
            </button>
          </div>

          <table className="w-full border-collapse">
            <tbody>
              {datos.gastos.map((g) => (
                <FilaNomina key={g.id} gasto={g} ocupado={ocupado} onEjecutar={ejecutar} onError={setError} />
              ))}
              {datos.gastos.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-ink-soft">
                    Sin nóminas este mes. Genera desde la plantilla o añade una línea abajo.
                  </td>
                </tr>
              )}

              {/* Alta */}
              <tr className="border-t border-line bg-hover/60">
                <td className="px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={trabajadorId}
                      onChange={(e) => {
                        setTrabajadorId(e.target.value);
                        const t = activos.find((x) => x.id === e.target.value);
                        if (t) {
                          setConcepto(`Nómina ${t.nombre}`);
                          setTipo("nomina");
                          if (t.salario != null && !importe) setImporte(String(t.salario));
                        }
                      }}
                      className="rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                    >
                      <option value="">— Trabajador —</option>
                      {activos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Concepto (o Seguridad Social, gestoría…)"
                      value={concepto}
                      onChange={(e) => setConcepto(e.target.value)}
                      className="min-w-[180px] flex-1 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                    />
                    <select
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value as GastoPersonal["tipo"])}
                      className="rounded-lg border border-line bg-card px-2 py-2 text-[13px] font-semibold outline-none focus:border-brand"
                    >
                      {TIPOS.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.etiqueta}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="importe €"
                      value={importe}
                      onChange={(e) => setImporte(e.target.value)}
                      className="w-24 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                    />
                    <button
                      onClick={() =>
                        ejecutar(async () => {
                          const res = await agregarNomina({
                            mes: datos.mes,
                            concepto,
                            importe: parseFloat(importe.replace(",", ".")),
                            tipo,
                            trabajadorId: trabajadorId || null,
                          });
                          if (res.ok) {
                            setTrabajadorId("");
                            setConcepto("");
                            setImporte("");
                            setTipo("nomina");
                          }
                          return res;
                        })
                      }
                      disabled={!concepto.trim() || !importe || ocupado}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
                    >
                      <Plus className="size-3.5" /> Añadir
                    </button>
                  </div>
                </td>
              </tr>

              <tr className="border-t border-line">
                <td className="px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-bold">Total del mes</span>
                    <span className="font-display text-[17px] font-bold">{eur(datos.total)}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Resumen + plantilla ── */}
        <div className="flex flex-col gap-3.5">
          <div className="card p-5">
            <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              Gasto de personal · {datos.mes}
            </div>
            <div className="mt-1.5 font-display text-[30px] font-bold tracking-tight">{eur(datos.total)}</div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              Entra en el dashboard en la categoría <b className="text-ink">Personal</b> (General y A tiempo real).
            </p>
          </div>

          <button
            onClick={() =>
              ejecutar(
                () => copiarMesAnterior(datos.mes),
                () => "Conceptos del mes anterior copiados (sin el PDF, que es de cada mes)",
              )
            }
            disabled={ocupado}
            className="card flex cursor-pointer items-center justify-center gap-2 px-4 py-3 text-[13.5px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
          >
            <Copy className="size-4 text-ink-soft" /> Copiar conceptos del mes anterior
          </button>

          <Plantilla trabajadores={trabajadores} ocupado={ocupado} onEjecutar={ejecutar} />
        </div>
      </div>

      {/* Tabla estilo JOMA: todos los trabajadores activos con su desglose de nómina del mes */}
      <TablaDesglosePersonal mes={datos.mes} trabajadores={trabajadores} gastos={datos.gastos} />
    </section>
  );
}

// ── Fila de nómina con su documento ──────────────────────────────────────

function FilaNomina({
  gasto: g,
  ocupado,
  onEjecutar,
  onError,
}: {
  gasto: GastoPersonal;
  ocupado: boolean;
  onEjecutar: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  onError: (m: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const tono = TIPOS.find((t) => t.valor === g.tipo)?.tono ?? "gray";
  const etiquetaTipo = TIPOS.find((t) => t.valor === g.tipo)?.etiqueta ?? "Otro";

  function elegirArchivo(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      onError("El documento es demasiado grande (máx. 4 MB)");
      return;
    }
    setSubiendo(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      onEjecutar(async () => {
        const res = await subirDocumentoNomina(g.id, dataUrl, file.name);
        setSubiendo(false);
        return res;
      });
    };
    reader.onerror = () => {
      setSubiendo(false);
      onError("No se pudo leer el archivo");
    };
    reader.readAsDataURL(file);
  }

  return (
    <tr className="border-b border-line last:border-none hover:bg-hover">
      <td className="px-3.5 py-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            elegirArchivo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-[150px] flex-1 text-sm font-semibold">
            {g.concepto}
            <Chip tone={tono} className="ml-2 align-middle">
              {etiquetaTipo}
            </Chip>
          </span>
          <span className="font-display text-[14.5px] font-bold">{eur(g.importe)}</span>

          {/* Documento */}
          {g.tieneDocumento ? (
            <span className="flex items-center gap-1">
              <button
                onClick={async () => {
                  const err = await abrirDocumento(g.id);
                  if (err) onError(err);
                }}
                title={g.documentoNombre ?? "Ver documento"}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-ink"
              >
                <FileText className="size-3.5 text-brand" /> Ver PDF
              </button>
              <button
                onClick={() => onEjecutar(() => quitarDocumentoNomina(g.id))}
                disabled={ocupado}
                title="Quitar documento"
                className="cursor-pointer rounded-lg p-1.5 text-ink-soft hover:bg-bad-soft hover:text-bad"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              disabled={ocupado || subiendo}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-ink disabled:opacity-50"
            >
              {subiendo ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
              {subiendo ? "Subiendo…" : "Adjuntar PDF"}
            </button>
          )}

          <button
            onClick={() => onEjecutar(() => eliminarGastoPersonal(g.id))}
            disabled={ocupado}
            title="Eliminar línea"
            className="cursor-pointer rounded-lg p-1.5 text-ink-soft hover:bg-bad-soft hover:text-bad"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Plantilla (roster de trabajadores) ───────────────────────────────────

function Plantilla({
  trabajadores,
  ocupado,
  onEjecutar,
}: {
  trabajadores: Trabajador[];
  ocupado: boolean;
  onEjecutar: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [puesto, setPuesto] = useState("");
  const [salario, setSalario] = useState("");
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  return (
    <div className="card p-5">
      <h3 className="font-display text-base font-bold tracking-tight">
        Plantilla <span className="font-body text-[12.5px] font-normal text-ink-soft">· tu equipo, mes a mes</span>
      </h3>

      <div className="mt-3 flex flex-col gap-2">
        {trabajadores.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2 rounded-xl border border-line px-3 py-2",
              !t.activo && "opacity-55",
            )}
          >
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px] font-semibold">{t.nombre}</b>
              {t.puesto && <small className="text-[11.5px] text-ink-soft">{t.puesto}</small>}
            </div>
            <CampoSalario
              valorInicial={t.salario}
              onGuardar={(v) => onEjecutar(() => actualizarTrabajador(t.id, { salario: v }))}
            />
            <button
              onClick={() => onEjecutar(() => actualizarTrabajador(t.id, { activo: !t.activo }))}
              title={t.activo ? "Dar de baja" : "Reactivar"}
              className="cursor-pointer"
            >
              {t.activo ? <Chip tone="good">alta</Chip> : <Chip tone="gray">baja</Chip>}
            </button>
            <button
              onClick={() => {
                if (borrandoId !== t.id) {
                  setBorrandoId(t.id);
                  setTimeout(() => setBorrandoId(null), 4000);
                  return;
                }
                onEjecutar(() => eliminarTrabajador(t.id));
              }}
              title={borrandoId === t.id ? "Otra vez para borrar" : "Eliminar"}
              className={cn(
                "cursor-pointer rounded-lg p-1.5 transition-colors",
                borrandoId === t.id ? "bg-bad text-white" : "text-ink-soft hover:bg-bad-soft hover:text-bad",
              )}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {trabajadores.length === 0 && (
          <p className="rounded-xl bg-chip px-3.5 py-3 text-[12.5px] text-ink-soft">
            Añade a tu equipo para generar sus nóminas cada mes con un clic.
          </p>
        )}
      </div>

      {/* Alta de trabajador */}
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <input
            placeholder="Puesto"
            value={puesto}
            onChange={(e) => setPuesto(e.target.value)}
            className="w-24 rounded-xl border border-line bg-card px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="€/mes"
            value={salario}
            onChange={(e) => setSalario(e.target.value)}
            className="w-20 rounded-xl border border-line bg-card px-2.5 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <button
            onClick={() =>
              onEjecutar(async () => {
                const res = await crearTrabajador({
                  nombre,
                  puesto,
                  salario: salario ? parseFloat(salario.replace(",", ".")) : null,
                });
                if (res.ok) {
                  setNombre("");
                  setPuesto("");
                  setSalario("");
                }
                return res;
              })
            }
            disabled={!nombre.trim() || ocupado}
            className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-ink px-3 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-40"
          >
            <Upload className="size-3.5" /> Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

function CampoSalario({
  valorInicial,
  onGuardar,
}: {
  valorInicial: number | null;
  onGuardar: (valor: number | null) => void;
}) {
  const [texto, setTexto] = useState(valorInicial != null ? String(valorInicial) : "");
  return (
    <span className="flex items-center gap-0.5">
      <input
        type="number"
        step="0.01"
        min="0"
        value={texto}
        placeholder="—"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const v = texto.trim() === "" ? null : parseFloat(texto.replace(",", "."));
          const inicial = valorInicial;
          if (v !== inicial) onGuardar(v);
        }}
        className="w-16 rounded-lg border border-line bg-card px-2 py-1 text-right text-[12.5px] outline-none focus:border-brand"
        title="Salario mensual de referencia"
      />
      <span className="text-[11px] text-ink-soft">€</span>
    </span>
  );
}
