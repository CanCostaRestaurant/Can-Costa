"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, FileText, Inbox, Mail, SlidersHorizontal, X } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { MonthPicker } from "@/components/date-picker";
import { SeccionesDocumentos } from "@/components/secciones-documentos";
import {
  ETIQUETA_CATEGORIA,
  type CategoriaGasto,
  type EstadoFactura,
  type Factura,
  type TipoDocumento,
} from "@/lib/mock";
import { cn, eur } from "@/lib/utils";
import {
  aceptarRechazada,
  actualizarDocumento,
  actualizarLineaFactura,
  agregarLineaFactura,
  eliminarFactura,
  eliminarLineaFactura,
  procesarDocumento,
  revisarBuzon,
  validarFactura,
} from "./actions";

type FiltroEstado = "todas" | "revisar" | "validada" | "rechazada";
type Orden = "fecha" | "importe-desc" | "importe-asc";

type ProductoOpcion = { id: string; nombre: string; precio: string };

const TIPOS: { valor: TipoDocumento; etiqueta: string }[] = [
  { valor: "factura", etiqueta: "Factura" },
  { valor: "albaran", etiqueta: "Albarán" },
  { valor: "ticket", etiqueta: "Ticket" },
];

export function FacturasClient({
  facturas,
  productos,
  puedeEmitidas,
}: {
  facturas: Factura[];
  productos: ProductoOpcion[];
  puedeEmitidas: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [conFiltros, setConFiltros] = useState(false);
  const [fMes, setFMes] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fCat, setFCat] = useState("");
  const [fProv, setFProv] = useState("");
  const [fCon, setFCon] = useState(""); // "" | "si" | "no"
  const [orden, setOrden] = useState<Orden>("fecha");
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [validando, startValidar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [leyendo, startLeer] = useTransition();
  const [arrastrando, setArrastrando] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [revisandoBuzon, startBuzon] = useTransition();
  const [avisoBuzon, setAvisoBuzon] = useState<string | null>(null);

  // Corrección de líneas en la bandeja
  const [corrigiendo, startCorregir] = useTransition();
  const [nuevaDesc, setNuevaDesc] = useState("");
  const [nuevaCant, setNuevaCant] = useState("");
  const [nuevoPrecio, setNuevoPrecio] = useState("");

  function ejecutarCorreccion(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startCorregir(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar la corrección");
        return;
      }
      router.refresh();
    });
  }

  function onRevisarBuzon() {
    setAvisoBuzon(null);
    setErrorSubida(null);
    startBuzon(async () => {
      const res = await revisarBuzon();
      if (!res.ok) {
        setErrorSubida(res.error ?? "No se pudo revisar el buzón");
        return;
      }
      setAvisoBuzon(
        res.aviso ??
          `${res.procesados} documento${res.procesados === 1 ? "" : "s"} nuevos del buzón, ya en la bandeja`,
      );
      router.refresh();
    });
  }

  function onArchivo(archivo: File | null | undefined) {
    if (!archivo || leyendo) return;
    setErrorSubida(null);
    const fd = new FormData();
    fd.append("archivo", archivo);
    startLeer(async () => {
      const res = await procesarDocumento(fd);
      if (!res.ok) setErrorSubida(res.error ?? "No se pudo procesar el documento");
      router.refresh();
    });
  }

  const porRevisar = facturas.filter((f) => f.estado === "revisar").length;
  const rechazadas = facturas.filter((f) => f.estado === "rechazada").length;
  const proveedoresUnicos = useMemo(
    () => [...new Set(facturas.map((f) => f.proveedor))].sort((a, b) => a.localeCompare(b)),
    [facturas],
  );

  const hayFiltrosFinos = Boolean(fMes || fTipo || fCat || fProv || fCon);
  const visibles = useMemo(() => {
    let lista = facturas.filter((f) => (filtro === "todas" ? f.estado !== "rechazada" : f.estado === filtro));
    if (fMes) lista = lista.filter((f) => f.fechaISO?.startsWith(fMes));
    if (fTipo) lista = lista.filter((f) => f.tipo === fTipo);
    if (fCat) lista = lista.filter((f) => f.categoriaEfectiva === fCat);
    if (fProv) lista = lista.filter((f) => f.proveedor === fProv);
    if (fCon) {
      const conciliado = (f: Factura) => Boolean(f.facturaPadreId) || (f.numAlbaranes ?? 0) > 0;
      lista = lista.filter((f) => (fCon === "si" ? conciliado(f) : !conciliado(f)));
    }
    if (orden !== "fecha") {
      lista = [...lista].sort((a, b) =>
        orden === "importe-desc" ? (b.total ?? -1) - (a.total ?? -1) : (a.total ?? Infinity) - (b.total ?? Infinity),
      );
    }
    return lista;
  }, [facturas, filtro, fMes, fTipo, fCat, fProv, fCon, orden]);

  // Resumen del filtro (como haddock: N documentos, total y por proveedor).
  const resumen = useMemo(() => {
    if (!hayFiltrosFinos) return null;
    const conTotal = visibles.filter((f) => f.total !== null);
    const total = conTotal.reduce((a, f) => a + (f.total ?? 0), 0);
    const porProveedor = new Map<string, number>();
    for (const f of conTotal) porProveedor.set(f.proveedor, (porProveedor.get(f.proveedor) ?? 0) + (f.total ?? 0));
    return {
      n: visibles.length,
      total,
      proveedores: [...porProveedor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    };
  }, [visibles, hayFiltrosFinos]);

  const abierta = facturas.find((f) => f.id === abiertaId) ?? null;

  function onValidar(id: string) {
    setError(null);
    startValidar(async () => {
      const res = await validarFactura(id);
      if (!res.ok) {
        setError(res.error ?? "No se pudo validar");
        return;
      }
      setAbiertaId(null);
      router.refresh();
    });
  }

  function limpiarFiltros() {
    setFMes("");
    setFTipo("");
    setFCat("");
    setFProv("");
    setFCon("");
    setOrden("fecha");
  }

  return (
    <section className="anim-in">
      <SeccionesDocumentos activa="recibidas" mostrarEmitidas={puedeEmitidas} mostrarBanco={puedeEmitidas} />
      <PageHead
        titulo="Facturas y albaranes"
        subtitulo="Revisa la bandeja y valida: los precios se actualizan solos"
        derecha={
          <div className="flex items-center gap-2">
            <button
              onClick={onRevisarBuzon}
              disabled={revisandoBuzon}
              title="Buscar facturas nuevas en el buzón de correo ahora"
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
            >
              <Inbox className="size-4" /> {revisandoBuzon ? "Revisando…" : "Revisar buzón"}
            </button>
            <button
              onClick={() => setConFiltros((v) => !v)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-colors",
                conFiltros || hayFiltrosFinos
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-card text-ink-soft hover:border-[#CFC6B4]",
              )}
            >
              <SlidersHorizontal className="size-4" /> Filtros
            </button>
          </div>
        }
      />

      <input
        ref={inputArchivo}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          onArchivo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div
        onClick={() => !leyendo && inputArchivo.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          onArchivo(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "mb-4.5 flex cursor-pointer items-center justify-center gap-8 rounded-card border-2 border-dashed p-7 transition-colors max-md:flex-col max-md:gap-4",
          arrastrando
            ? "border-brand bg-brand-soft"
            : "border-[#D8CFBE] bg-linear-to-b from-[#FFFDF9] to-[#FBF7EF] hover:border-brand",
        )}
      >
        {leyendo ? (
          <div className="text-center">
            <div className="font-display text-lg font-bold tracking-tight">🤖 Leyendo el documento con IA…</div>
            <p className="mt-1 text-[13.5px] text-ink-soft">
              extrayendo proveedor, fecha, tipo y líneas de producto — unos segundos
            </p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="font-display text-lg font-bold tracking-tight">Arrastra aquí tus facturas</div>
              <p className="mt-1 text-[13.5px] text-ink-soft">
                o haz clic para elegir una foto o PDF · la IA extrae tipo, categoría y líneas sola
              </p>
            </div>
            <div className="flex gap-3">
              <ViaSubida icon={<Camera className="size-5 text-brand" />}>Foto móvil</ViaSubida>
              <ViaSubida icon={<FileText className="size-5 text-brand" />}>PDF</ViaSubida>
              <ViaSubida icon={<Mail className="size-5 text-brand" />}>facturas@…</ViaSubida>
            </div>
          </>
        )}
      </div>
      {errorSubida && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {errorSubida}
        </div>
      )}
      {avisoBuzon && (
        <div className="mb-3.5 rounded-[14px] bg-good-soft px-4 py-3 text-[13.5px] font-semibold text-good">
          {avisoBuzon}
        </div>
      )}

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <FiltroChip activo={filtro === "todas"} onClick={() => setFiltro("todas")}>
          Todas
        </FiltroChip>
        <FiltroChip activo={filtro === "revisar"} onClick={() => setFiltro("revisar")}>
          Por revisar · {porRevisar}
        </FiltroChip>
        <FiltroChip activo={filtro === "validada"} onClick={() => setFiltro("validada")}>
          Validadas
        </FiltroChip>
        <FiltroChip activo={filtro === "rechazada"} onClick={() => setFiltro("rechazada")} alerta={rechazadas > 0}>
          Rechazadas · {rechazadas}
        </FiltroChip>
      </div>

      {conFiltros && (
        <div className="card anim-in mb-3.5 flex flex-wrap items-center gap-2.5 px-4 py-3">
          <MonthPicker value={fMes} onChange={setFMes} clearable />
          <SelectFiltro valor={fTipo} onCambio={setFTipo} placeholder="Tipo">
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </SelectFiltro>
          <SelectFiltro valor={fCat} onCambio={setFCat} placeholder="Categoría">
            {Object.entries(ETIQUETA_CATEGORIA).map(([v, e]) => (
              <option key={v} value={v}>
                {e}
              </option>
            ))}
          </SelectFiltro>
          <SelectFiltro valor={fProv} onCambio={setFProv} placeholder="Proveedor">
            {proveedoresUnicos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectFiltro>
          <SelectFiltro valor={fCon} onCambio={setFCon} placeholder="Conciliación">
            <option value="si">Conciliados</option>
            <option value="no">Sin conciliar</option>
          </SelectFiltro>
          <SelectFiltro
            valor={orden === "fecha" ? "" : orden}
            onCambio={(v) => setOrden((v || "fecha") as Orden)}
            placeholder="Ordenar: fecha"
          >
            <option value="importe-desc">Mayor importe</option>
            <option value="importe-asc">Menor importe</option>
          </SelectFiltro>
          {hayFiltrosFinos && (
            <button
              onClick={limpiarFiltros}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-bad hover:bg-bad-soft"
            >
              Eliminar filtros
            </button>
          )}
        </div>
      )}

      {resumen && (
        <div className="card anim-in mb-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 bg-ink px-5 py-3.5 text-white">
          <span className="text-[13.5px]">
            <b className="font-display text-[16px]">{resumen.n}</b> documentos ·{" "}
            <b className="font-display text-[16px]">{eur(resumen.total)}</b>
          </span>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-white/75">
            {resumen.proveedores.map(([nombre, importe]) => (
              <span key={nombre}>
                {nombre} <b className="text-white">{eur(importe, false)}</b>
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Proveedor</Th>
              <Th>Fecha</Th>
              <Th>Tipo · Categoría</Th>
              <Th>Líneas</Th>
              <Th>Total</Th>
              <Th>Pago</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const editableMeta = f.estado !== "procesando" && f.estado !== "error";
              return (
                <tr
                  key={f.id}
                  onClick={f.lineasDetalle?.length ? () => setAbiertaId(f.id) : undefined}
                  className={cn(
                    "border-b border-line transition-colors last:border-none",
                    f.lineasDetalle?.length && "cursor-pointer hover:bg-hover",
                    abiertaId === f.id && "bg-hover",
                  )}
                >
                  <Td>
                    <span className="flex items-center gap-1.5 font-semibold">
                      {f.proveedor}
                      {f.incidencia && (
                        <span title={`Incidencia: ${f.incidencia}`}>
                          <AlertTriangle className="size-3.5 text-warn" />
                        </span>
                      )}
                      {(f.facturaPadreId || (f.numAlbaranes ?? 0) > 0) && (
                        <span
                          title={
                            f.facturaPadreId
                              ? "Albarán conciliado con su factura"
                              : `Factura conciliada con ${f.numAlbaranes} albaranes`
                          }
                          className="rounded-full bg-good-soft px-1.5 py-0.5 text-[10px] font-bold text-good"
                        >
                          conciliado
                        </span>
                      )}
                    </span>
                    <span className="mt-px block text-xs text-ink-soft">{f.detalle}</span>
                    {f.estado === "rechazada" && f.motivoRechazo && (
                      <span className="mt-1 block text-xs font-semibold text-bad">{f.motivoRechazo}</span>
                    )}
                  </Td>
                  <Td>{f.fecha}</Td>
                  <Td>
                    {editableMeta ? (
                      <span className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={f.tipo ?? "factura"}
                          onChange={(e) =>
                            ejecutarCorreccion(() =>
                              actualizarDocumento(f.id, { tipo: e.target.value as TipoDocumento }),
                            )
                          }
                          className="w-fit rounded-md border border-transparent bg-transparent py-0.5 pr-1 text-[12.5px] font-semibold outline-none hover:border-line focus:border-brand"
                        >
                          {TIPOS.map((t) => (
                            <option key={t.valor} value={t.valor}>
                              {t.etiqueta}
                            </option>
                          ))}
                        </select>
                        <select
                          value={f.categoria ?? ""}
                          onChange={(e) =>
                            ejecutarCorreccion(() =>
                              actualizarDocumento(f.id, {
                                categoria: (e.target.value || null) as CategoriaGasto | null,
                              }),
                            )
                          }
                          className="w-fit rounded-md border border-transparent bg-transparent py-0.5 pr-1 text-[11.5px] text-ink-soft outline-none hover:border-line focus:border-brand"
                        >
                          <option value="">
                            {ETIQUETA_CATEGORIA[f.categoriaEfectiva ?? "otros"]} (proveedor)
                          </option>
                          {Object.entries(ETIQUETA_CATEGORIA).map(([v, e]) => (
                            <option key={v} value={v}>
                              {e}
                            </option>
                          ))}
                        </select>
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{f.lineas || "—"}</Td>
                  <Td className="font-display text-[14.5px] font-semibold whitespace-nowrap">
                    {f.total !== null ? eur(f.total) : "—"}
                  </Td>
                  <Td>
                    {editableMeta ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          ejecutarCorreccion(() => actualizarDocumento(f.id, { pagada: !f.pagada }));
                        }}
                        title="Cambiar estado de pago"
                        className="cursor-pointer"
                      >
                        {f.pagada ? (
                          <Chip tone="good">Pagada</Chip>
                        ) : (
                          <Chip tone="gray">Por pagar</Chip>
                        )}
                      </button>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {f.estado === "rechazada" ? (
                      <span className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => ejecutarCorreccion(() => aceptarRechazada(f.id))}
                          className="cursor-pointer rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold whitespace-nowrap text-ink-soft hover:border-good hover:text-good"
                        >
                          No es duplicado
                        </button>
                        <button
                          onClick={() => ejecutarCorreccion(() => eliminarFactura(f.id))}
                          className="cursor-pointer rounded-lg bg-bad-soft px-2.5 py-1.5 text-[12px] font-semibold text-bad hover:bg-bad hover:text-white"
                        >
                          Eliminar
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <EstadoChip estado={f.estado} />
                        {f.estado === "error" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              ejecutarCorreccion(() => eliminarFactura(f.id));
                            }}
                            title="Eliminar documento con error"
                            className="cursor-pointer rounded-lg p-1 text-ink-soft hover:bg-bad-soft hover:text-bad"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <Td colSpan={7} className="py-8 text-center text-ink-soft">
                  No hay documentos con este filtro
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {abierta && abierta.lineasDetalle && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 md:p-8"
          onClick={() => setAbiertaId(null)}
        >
          <div
            className="card anim-in w-full max-w-4xl overflow-hidden shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="flex items-center gap-3.5 border-b border-line px-5.5 py-4.5 max-md:flex-wrap">
            <div className="grid size-[42px] shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <FileText className="size-5" />
            </div>
            <div>
              <h3 className="font-display text-[17px] font-bold tracking-tight">
                {abierta.proveedor} · {abierta.detalle}
              </h3>
              <small className="text-[12.5px] text-ink-soft">
                {abierta.fecha} · al validar, los precios pasan al histórico
              </small>
            </div>
            <div className="ml-auto text-right">
              <small className="text-[12.5px] text-ink-soft">Total</small>
              <b className="block font-display text-[22px] font-bold">{eur(abierta.total!)}</b>
            </div>
          </div>
          {abierta.estado === "revisar" && (
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-hover/50 px-5.5 py-2.5">
              <span className="text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
                Incidencia de compra
              </span>
              <IncidenciaInput
                valorInicial={abierta.incidencia ?? ""}
                onGuardar={(v) => ejecutarCorreccion(() => actualizarDocumento(abierta.id, { incidencia: v }))}
              />
            </div>
          )}
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Cantidad</Th>
                <Th>Precio ud.</Th>
                <Th>Total</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {abierta.lineasDetalle.map((l) => {
                const editable = abierta.estado === "revisar" && Boolean(l.id);
                return (
                  <tr
                    key={l.id ?? l.producto}
                    className={cn("border-b border-line", l.variacion && l.variacion > 0 && "bg-warn-soft")}
                  >
                    <Td className="font-semibold">
                      {l.producto}
                      {editable && (
                        <select
                          value={l.productoId ?? ""}
                          onChange={(e) =>
                            ejecutarCorreccion(() =>
                              actualizarLineaFactura(l.id!, abierta.id, {
                                productoId: e.target.value || null,
                              }),
                            )
                          }
                          className="mt-1 block w-full max-w-[240px] rounded-lg border border-line bg-card px-2 py-1 text-xs font-normal text-ink-soft outline-none focus:border-brand"
                        >
                          <option value="">— sin mapear a catálogo —</option>
                          {productos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre} · {p.precio}
                            </option>
                          ))}
                        </select>
                      )}
                    </Td>
                    <Td>
                      {editable ? (
                        <CampoLinea
                          valorInicial={l.cantidadNum ?? 0}
                          sufijo={l.unidad ?? "ud"}
                          paso="0.001"
                          onGuardar={(v) =>
                            ejecutarCorreccion(() =>
                              actualizarLineaFactura(l.id!, abierta.id, { cantidad: v }),
                            )
                          }
                        />
                      ) : (
                        l.cantidad
                      )}
                    </Td>
                    <Td className="font-display font-semibold">
                      {editable ? (
                        <CampoLinea
                          valorInicial={l.precioNum ?? 0}
                          sufijo={`€/${l.unidad ?? "ud"}`}
                          paso="0.01"
                          onGuardar={(v) =>
                            ejecutarCorreccion(() =>
                              actualizarLineaFactura(l.id!, abierta.id, { precioUnitario: v }),
                            )
                          }
                        />
                      ) : (
                        l.precioUd
                      )}
                    </Td>
                    <Td className="font-display font-semibold">{eur(l.total)}</Td>
                    <Td>
                      <span className="flex items-center justify-end gap-1.5">
                        {l.variacion !== undefined &&
                          (l.variacion > 0 ? (
                            <Chip tone="bad">▲ +{l.variacion}%</Chip>
                          ) : (
                            <Chip tone="good">▼ {l.variacion}%</Chip>
                          ))}
                        {editable && (
                          <button
                            onClick={() =>
                              ejecutarCorreccion(() => eliminarLineaFactura(l.id!, abierta.id))
                            }
                            title="Eliminar línea"
                            className="cursor-pointer rounded-lg p-1.5 text-ink-soft transition-colors hover:bg-bad-soft hover:text-bad"
                          >
                            <X className="size-4" />
                          </button>
                        )}
                      </span>
                    </Td>
                  </tr>
                );
              })}

              {abierta.estado === "revisar" && (
                <tr className="border-b border-line bg-hover/60">
                  <Td>
                    <input
                      placeholder="+ Añadir línea que falte…"
                      value={nuevaDesc}
                      onChange={(e) => setNuevaDesc(e.target.value)}
                      className="w-full rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="cant."
                      value={nuevaCant}
                      onChange={(e) => setNuevaCant(e.target.value)}
                      className="w-20 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="precio"
                      value={nuevoPrecio}
                      onChange={(e) => setNuevoPrecio(e.target.value)}
                      className="w-24 rounded-lg border border-line bg-card px-2.5 py-2 text-sm outline-none focus:border-brand"
                    />
                  </Td>
                  <Td colSpan={2}>
                    <button
                      onClick={() =>
                        ejecutarCorreccion(async () => {
                          const res = await agregarLineaFactura(abierta.id, {
                            descripcion: nuevaDesc,
                            cantidad: parseFloat(nuevaCant.replace(",", ".")) || undefined,
                            precioUnitario: parseFloat(nuevoPrecio.replace(",", ".")) || undefined,
                          });
                          if (res.ok) {
                            setNuevaDesc("");
                            setNuevaCant("");
                            setNuevoPrecio("");
                          }
                          return res;
                        })
                      }
                      disabled={!nuevaDesc.trim() || corrigiendo}
                      className="cursor-pointer rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
                    >
                      Añadir
                    </button>
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-end gap-2.5 px-5.5 py-4">
            {error && <span className="mr-auto text-[13px] font-semibold text-bad">{error}</span>}
            <button
              onClick={() => setAbiertaId(null)}
              className="cursor-pointer rounded-xl border border-line px-5 py-2.5 text-sm font-semibold transition-colors hover:border-[#CFC6B4]"
            >
              Cerrar
            </button>
            {abierta.estado === "revisar" && (
              <button
                onClick={() => onValidar(abierta.id)}
                disabled={validando}
                className="cursor-pointer rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
              >
                {validando ? "Validando…" : "✓ Validar factura"}
              </button>
            )}
          </div>
          </div>
        </div>
      )}
    </section>
  );
}

function IncidenciaInput({
  valorInicial,
  onGuardar,
}: {
  valorInicial: string;
  onGuardar: (v: string) => void;
}) {
  const [texto, setTexto] = useState(valorInicial);
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto !== valorInicial && onGuardar(texto)}
      placeholder="p. ej. faltan 2 cajas, precio distinto al pactado… (vacío = sin incidencia)"
      className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] outline-none placeholder:text-ink-soft/50 focus:border-brand"
    />
  );
}

function CampoLinea({
  valorInicial,
  sufijo,
  paso,
  onGuardar,
}: {
  valorInicial: number;
  sufijo: string;
  paso: string;
  onGuardar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(valorInicial));
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        step={paso}
        min="0"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const v = parseFloat(texto.replace(",", "."));
          if (Number.isFinite(v) && v !== valorInicial) onGuardar(v);
        }}
        className="w-20 rounded-lg border border-line bg-card px-2 py-1 font-body text-sm font-normal outline-none focus:border-brand"
      />
      <span className="text-xs font-normal text-ink-soft">{sufijo}</span>
    </span>
  );
}

function SelectFiltro({
  valor,
  onCambio,
  placeholder,
  children,
}: {
  valor: string;
  onCambio: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      className={cn(
        "rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-brand",
        valor ? "font-semibold" : "text-ink-soft",
      )}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

function ViaSubida({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-1.5 rounded-[14px]! px-4.5 py-3.5 text-[12.5px] font-semibold text-ink-soft">
      {icon}
      {children}
    </div>
  );
}

function FiltroChip({
  activo,
  alerta,
  onClick,
  children,
}: {
  activo: boolean;
  alerta?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all",
        activo
          ? "border-ink bg-ink text-white"
          : alerta
            ? "border-bad bg-bad-soft text-bad hover:border-bad"
            : "border-line bg-card text-ink-soft hover:border-[#CFC6B4]",
      )}
    >
      {children}
    </button>
  );
}

function EstadoChip({ estado }: { estado: EstadoFactura }) {
  if (estado === "procesando")
    return (
      <Chip tone="gray" dot pulse>
        Procesando…
      </Chip>
    );
  if (estado === "revisar")
    return (
      <Chip tone="warn" dot>
        Revisar
      </Chip>
    );
  if (estado === "error")
    return (
      <Chip tone="bad" dot>
        Error de lectura
      </Chip>
    );
  if (estado === "rechazada")
    return (
      <Chip tone="bad" dot>
        Rechazada
      </Chip>
    );
  return (
    <Chip tone="good" dot>
      Validada
    </Chip>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("px-3.5 py-3 align-middle text-sm", className)}>
      {children}
    </td>
  );
}
