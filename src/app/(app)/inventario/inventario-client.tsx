"use client";

// Inventario: stock teórico movido solo por la operativa real (facturas
// validadas suman, tickets cobrados restan vía escandallo) + recuentos con
// DESVIACIÓN: compras 10, vendes 5 según TPV → teórico 7; cuentas 3 → se
// apunta desviación −4 y el teórico pasa a 3. Esa desviación acumulada es el
// chivato de mermas, raciones generosas y pérdidas.
// Fase 2: lista de compra sugerida (cubrir 7 días), aviso "toca recuento",
// histórico de recuentos por producto y apunte de merma manual.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Check, ChevronDown, Copy, Search, ShoppingCart, TriangleAlert } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { type EstadoStock, type Inventario, type ProductoInventario } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { apuntarMerma, historialRecuentos, recontarStock, type RecuentoHistorial } from "./actions";

const FAMILIAS: { id: ProductoInventario["familia"] | "todas"; nombre: string }[] = [
  { id: "todas", nombre: "Todas" },
  { id: "pescado", nombre: "Pescado" },
  { id: "carne", nombre: "Carne" },
  { id: "fruta-verdura", nombre: "Fruta y verdura" },
  { id: "seco", nombre: "Seco" },
  { id: "bebida", nombre: "Bebida" },
  { id: "otros", nombre: "Otros" },
];

function sinAcentos(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Cantidades con hasta 2 decimales, sin ceros de cola ("3", "0,45", "1,5").
// useGrouping "always": es-ES no separa miles en cifras de 4 dígitos por defecto.
function cant(n: number): string {
  return n.toLocaleString("es-ES", {
    maximumFractionDigits: 2,
    useGrouping: "always" as unknown as boolean,
  });
}

export function InventarioClient({ datos }: { datos: Inventario }) {
  const [familia, setFamilia] = useState<(typeof FAMILIAS)[number]["id"]>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null); // fila expandida

  const visibles = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    return datos.productos.filter(
      (p) => (familia === "todas" || p.familia === familia) && (!q || sinAcentos(p.nombre).includes(q)),
    );
  }, [datos.productos, familia, busqueda]);

  // Las alertas primero (agotado > crítico > bajo), luego el resto por nombre.
  const ORDEN: Record<EstadoStock, number> = { agotado: 0, critico: 1, bajo: 2, ok: 3, sin_iniciar: 4 };
  const ordenados = [...visibles].sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre));

  // Lista de compra: agrupada por proveedor, para cubrir una semana.
  const listaCompra = useMemo(() => {
    const conSugerencia = datos.productos.filter((p) => p.sugerenciaPedido > 0);
    const grupos = new Map<string, ProductoInventario[]>();
    for (const p of conSugerencia) {
      const clave = p.proveedor ?? "Sin proveedor asignado";
      grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [datos.productos]);

  const [copiado, setCopiado] = useState(false);
  function copiarLista() {
    const texto = listaCompra
      .map(
        ([prov, items]) =>
          `${prov}:\n` + items.map((p) => `  - ${cant(p.sugerenciaPedido)} ${p.unidad} ${p.nombre}`).join("\n"),
      )
      .join("\n");
    navigator.clipboard.writeText(`Pedido Can Costa\n${texto}`).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Inventario"
        subtitulo="Stock teórico en vivo: compras suman, ventas restan por escandallo — cuenta y cuadra la desviación"
        derecha={
          <label className="card flex items-center gap-2 rounded-full! px-4 py-2">
            <Search className="size-4 text-ink-soft" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto…"
              className="w-44 bg-transparent text-[13.5px] font-semibold outline-none placeholder:font-normal"
            />
          </label>
        }
      />

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-4 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        <Kpi etiqueta="Valor del stock" valor={eur(datos.valorTotal)} detalle="a último precio de compra" />
        <Kpi
          etiqueta="En alerta"
          valor={String(datos.enAlerta)}
          detalle="agotados o con pocos días de cobertura"
          tono={datos.enAlerta > 0 ? "bad" : "good"}
        />
        <Kpi
          etiqueta="Toca recuento"
          valor={String(datos.tocaRecuento)}
          detalle="más de 14 días sin contar"
          tono={datos.tocaRecuento > 0 ? "warn" : "good"}
        />
        <Kpi
          etiqueta="Sin recuento inicial"
          valor={String(datos.sinIniciar)}
          detalle="cuenta una vez para empezar a controlarlos"
          tono={datos.sinIniciar > 0 ? "warn" : "good"}
        />
      </div>

      {/* Lista de compra sugerida */}
      {listaCompra.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
              <ShoppingCart className="size-4 text-ink-soft" /> Qué pedir
              <span className="font-body text-[12px] font-normal text-ink-soft">para cubrir 7 días al ritmo actual</span>
            </h3>
            <button
              onClick={copiarLista}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-brand"
            >
              {copiado ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5 text-ink-soft" />}
              {copiado ? "Copiada" : "Copiar lista"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
            {listaCompra.map(([prov, items]) => (
              <div key={prov} className="rounded-xl border border-line p-3">
                <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{prov}</div>
                {items.map((p) => (
                  <div key={p.id} className="flex items-baseline justify-between py-0.5 text-[13px]">
                    <span className="min-w-0 truncate">{p.nombre}</span>
                    <b className="ml-2 font-display font-bold whitespace-nowrap">
                      {cant(p.sugerenciaPedido)} {p.unidad}
                    </b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtro por familia */}
      <div className="mb-3.5 flex flex-wrap gap-1.5">
        {FAMILIAS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFamilia(f.id)}
            className={cn(
              "cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              familia === f.id ? "bg-ink text-white" : "bg-chip text-ink-soft hover:text-ink",
            )}
          >
            {f.nombre}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th right>Stock</Th>
                <Th right>Consumo/día</Th>
                <Th>Cobertura</Th>
                <Th>Últ. entrada</Th>
                <Th>Últ. recuento</Th>
                <Th right>Desv. 30d</Th>
                <Th right>Recontar</Th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((p, i) => (
                <Fila
                  key={p.id}
                  p={p}
                  indice={i}
                  abierto={abierto === p.id}
                  onToggle={() => setAbierto(abierto === p.id ? null : p.id)}
                />
              ))}
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-ink-soft">
                    Sin productos que casen con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-soft">
        <b className="text-ink">Cómo leerlo:</b> el stock es <b className="text-ink">teórico</b> (entradas por facturas
        validadas − salidas por tickets cobrados). Al <b className="text-ink">recontar</b>, lo contado manda: la
        diferencia queda apuntada como desviación. Ejemplo: compras 10 aguacates, el TPV dice que se vendieron 5 →
        teórico 7; cuentas 3 → desviación <b className="text-bad">−4</b> (mermas, raciones generosas o pérdidas).
        Toca el nombre de un producto para ver su histórico o apuntar una merma.
      </p>
    </section>
  );
}

function Fila({
  p,
  indice,
  abierto,
  onToggle,
}: {
  p: ProductoInventario;
  indice: number;
  abierto: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [ocupado, start] = useTransition();
  const [contadoTxt, setContadoTxt] = useState("");
  const [error, setError] = useState(false);

  function recontar() {
    const v = parseFloat(contadoTxt.replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) {
      setError(true);
      return;
    }
    setError(false);
    start(async () => {
      const res = await recontarStock(p.id, v);
      if (!res.ok) {
        setError(true);
        return;
      }
      setContadoTxt("");
      router.refresh();
    });
  }

  return (
    <>
      <tr
        className={cn("anim-in border-b border-line hover:bg-hover", !abierto && "last:border-none")}
        style={{ animationDelay: `${Math.min(indice, 20) * 20}ms` }}
      >
        <td className="cursor-pointer px-4 py-2.5" onClick={onToggle}>
          <b className="flex items-center gap-1.5 text-[13.5px] font-semibold">
            {p.nombre}
            <ChevronDown className={cn("size-3.5 text-ink-soft transition-transform", abierto && "rotate-180")} />
          </b>
          <small className="text-[11.5px] text-ink-soft capitalize">{p.familia.replace("-", " y ")}</small>
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          {p.stock === null ? (
            <span className="text-[13px] text-ink-soft">—</span>
          ) : (
            <b className={cn("font-display text-[14.5px] font-bold", p.stock <= 0 && "text-bad")}>
              {cant(p.stock)} <small className="font-body text-[11px] font-normal text-ink-soft">{p.unidad}</small>
            </b>
          )}
          {p.valor !== null && <small className="block text-[11px] text-ink-soft">{eur(p.valor)}</small>}
        </td>
        <td className="px-3 py-2.5 text-right text-[13px] text-ink-soft whitespace-nowrap">
          {p.consumoDia > 0 ? `${cant(p.consumoDia)} ${p.unidad}` : "—"}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <EstadoChip p={p} />
        </td>
        <td className="px-3 py-2.5 text-[13px] text-ink-soft whitespace-nowrap">{p.ultimaEntrada ?? "—"}</td>
        <td className="px-3 py-2.5 text-[13px] whitespace-nowrap">
          {p.ultimoRecuento ? (
            <span className="flex items-center gap-1.5 text-ink-soft">
              {p.ultimoRecuento.fecha}
              {p.ultimoRecuento.desviacion !== 0 && (
                <Chip tone={Math.abs(p.ultimoRecuento.desviacion) >= 1 ? "warn" : "gray"}>
                  {p.ultimoRecuento.desviacion > 0 ? "+" : ""}
                  {cant(p.ultimoRecuento.desviacion)}
                </Chip>
              )}
              {p.tocaRecuento && <Chip tone="warn">toca recuento</Chip>}
            </span>
          ) : p.tocaRecuento ? (
            <Chip tone="warn">toca recuento</Chip>
          ) : (
            <span className="text-ink-soft">nunca</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          {p.desviacion30d !== 0 ? (
            <b className={cn("font-display text-[13px] font-bold", p.desviacion30d < 0 ? "text-bad" : "text-good")}>
              {p.desviacion30d > 0 ? "+" : ""}
              {cant(p.desviacion30d)} {p.unidad}
            </b>
          ) : (
            <span className="text-[13px] text-ink-soft">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={contadoTxt}
              onChange={(e) => setContadoTxt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && contadoTxt.trim() && !ocupado) recontar();
              }}
              placeholder={p.stock === null ? "contar" : cant(p.stock)}
              aria-label={`Recuento de ${p.nombre} en ${p.unidad}`}
              title={error ? "No se pudo guardar el recuento — revisa la cantidad" : undefined}
              className={cn(
                "w-20 rounded-lg border bg-card px-2 py-1.5 text-right text-[13px] font-semibold outline-none focus:border-brand",
                error ? "border-bad" : "border-line",
              )}
            />
            <button
              onClick={recontar}
              disabled={ocupado || !contadoTxt.trim()}
              title="Guardar recuento (lo contado manda; la diferencia queda como desviación)"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg bg-ink text-white hover:bg-black disabled:opacity-30"
            >
              <Check className="size-3.5" />
            </button>
          </span>
        </td>
      </tr>
      {abierto && <FilaDetalle p={p} />}
    </>
  );
}

// Desplegable de la fila: histórico de recuentos + apunte de merma manual.
function FilaDetalle({ p }: { p: ProductoInventario }) {
  const router = useRouter();
  const [recuentos, setRecuentos] = useState<RecuentoHistorial[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [ocupado, start] = useTransition();
  const [mermaCant, setMermaCant] = useState("");
  const [mermaMotivo, setMermaMotivo] = useState("");
  const [mermaError, setMermaError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    historialRecuentos(p.id).then((res) => {
      if (!vivo) return;
      if (res.ok && res.recuentos) setRecuentos(res.recuentos);
      else setFallo(true);
    });
    return () => {
      vivo = false;
    };
  }, [p.id]);

  function apuntar() {
    const v = parseFloat(mermaCant.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      setMermaError("Cantidad no válida");
      return;
    }
    setMermaError(null);
    start(async () => {
      const res = await apuntarMerma(p.id, v, mermaMotivo);
      if (!res.ok) {
        setMermaError(res.error ?? "No se pudo apuntar");
        return;
      }
      setMermaCant("");
      setMermaMotivo("");
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-line bg-hover/50 last:border-none">
      <td colSpan={8} className="px-4 py-3.5">
        <div className="grid grid-cols-[1.5fr_1fr] gap-5 max-md:grid-cols-1">
          {/* Histórico de recuentos */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
              Histórico de recuentos
            </div>
            {recuentos === null && !fallo && <p className="text-[12.5px] text-ink-soft">Cargando…</p>}
            {fallo && <p className="text-[12.5px] text-bad">No se pudo cargar el histórico.</p>}
            {recuentos !== null && recuentos.length === 0 && (
              <p className="text-[12.5px] text-ink-soft">Aún sin recuentos: cuenta una vez para inicializarlo.</p>
            )}
            {recuentos !== null && recuentos.length > 0 && (
              <table className="w-full max-w-md border-collapse text-[12.5px]">
                <thead>
                  <tr className="text-left text-[10.5px] tracking-wider text-ink-soft uppercase">
                    <th className="py-1 pr-3 font-semibold">Fecha</th>
                    <th className="py-1 pr-3 text-right font-semibold">Teórico</th>
                    <th className="py-1 pr-3 text-right font-semibold">Contado</th>
                    <th className="py-1 pr-3 text-right font-semibold">Desviación</th>
                    <th className="py-1 font-semibold">Quién</th>
                  </tr>
                </thead>
                <tbody>
                  {recuentos.map((r, i) => (
                    <tr key={i} className="border-t border-line/70">
                      <td className="py-1 pr-3 whitespace-nowrap">{r.fecha}</td>
                      <td className="py-1 pr-3 text-right">{cant(r.teorico)}</td>
                      <td className="py-1 pr-3 text-right font-semibold">{cant(r.contado)}</td>
                      <td
                        className={cn(
                          "py-1 pr-3 text-right font-semibold",
                          r.desviacion < 0 ? "text-bad" : r.desviacion > 0 ? "text-good" : "text-ink-soft",
                        )}
                      >
                        {r.desviacion > 0 ? "+" : ""}
                        {cant(r.desviacion)}
                      </td>
                      <td className="py-1 text-ink-soft">{r.contadoPor ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Apuntar merma */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-soft uppercase">
              <TriangleAlert className="size-3.5" /> Apuntar merma
            </div>
            <p className="mb-2 text-[12px] text-ink-soft">
              Se cayó, se pasó de fecha… resta del stock al momento, con su motivo.
            </p>
            {mermaError && <p className="mb-1.5 text-[12px] font-semibold text-bad">{mermaError}</p>}
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={mermaCant}
                onChange={(e) => setMermaCant(e.target.value)}
                placeholder={p.unidad}
                aria-label={`Merma de ${p.nombre} en ${p.unidad}`}
                className="w-20 rounded-lg border border-line bg-card px-2 py-1.5 text-right text-[13px] font-semibold outline-none focus:border-brand"
              />
              <input
                value={mermaMotivo}
                onChange={(e) => setMermaMotivo(e.target.value)}
                placeholder="Motivo (caducado, rotura…)"
                aria-label="Motivo de la merma"
                className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
              />
              <button
                onClick={apuntar}
                disabled={ocupado || !mermaCant.trim()}
                className="cursor-pointer rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-black disabled:opacity-30"
              >
                {ocupado ? "Apuntando…" : "Apuntar"}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function EstadoChip({ p }: { p: ProductoInventario }) {
  if (p.estado === "sin_iniciar") return <Chip tone="gray">sin iniciar</Chip>;
  if (p.estado === "agotado")
    return (
      <Chip tone="bad">
        <TriangleAlert className="size-3" /> agotado
      </Chip>
    );
  if (p.estado === "critico")
    return (
      <Chip tone="bad">
        <TriangleAlert className="size-3" /> {p.cobertura!.toFixed(1).replace(".", ",")} días
      </Chip>
    );
  if (p.estado === "bajo") return <Chip tone="warn">{p.cobertura!.toFixed(1).replace(".", ",")} días</Chip>;
  if (p.cobertura !== null) return <Chip tone="good">{Math.round(p.cobertura)} días</Chip>;
  return (
    <Chip tone="good">
      <Boxes className="size-3" /> ok
    </Chip>
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
  tono?: "good" | "warn" | "bad";
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div
        className={cn(
          "mt-0.5 font-display text-[22px] font-bold tracking-tight",
          tono === "bad" && "text-bad",
          tono === "warn" && "text-warn",
        )}
      >
        {valor}
      </div>
      <div className="mt-0.5 text-[11.5px] text-ink-soft">{detalle}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "border-b border-line px-3 py-2.5 text-[11px] font-semibold tracking-wider text-ink-soft uppercase first:px-4",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
