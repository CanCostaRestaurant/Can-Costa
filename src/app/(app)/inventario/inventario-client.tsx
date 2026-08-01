"use client";

// Inventario: stock teórico movido solo por la operativa real (facturas
// validadas suman, tickets cobrados restan vía escandallo) + recuentos con
// DESVIACIÓN: compras 10, vendes 5 según TPV → teórico 7; cuentas 3 → se
// apunta desviación −4 y el teórico pasa a 3. Esa desviación acumulada es el
// chivato de mermas, raciones generosas y pérdidas.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Check, Search, TriangleAlert } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { type EstadoStock, type Inventario, type ProductoInventario } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { recontarStock } from "./actions";

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

  const visibles = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    return datos.productos.filter(
      (p) => (familia === "todas" || p.familia === familia) && (!q || sinAcentos(p.nombre).includes(q)),
    );
  }, [datos.productos, familia, busqueda]);

  // Las alertas primero (agotado > crítico > bajo), luego el resto por nombre.
  const ORDEN: Record<EstadoStock, number> = { agotado: 0, critico: 1, bajo: 2, ok: 3, sin_iniciar: 4 };
  const ordenados = [...visibles].sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre));

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
      <div className="mb-4 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        <Kpi etiqueta="Valor del stock" valor={eur(datos.valorTotal)} detalle="a último precio de compra" />
        <Kpi
          etiqueta="En alerta"
          valor={String(datos.enAlerta)}
          detalle="agotados o con pocos días de cobertura"
          tono={datos.enAlerta > 0 ? "bad" : "good"}
        />
        <Kpi
          etiqueta="Sin recuento inicial"
          valor={String(datos.sinIniciar)}
          detalle="cuenta una vez para empezar a controlarlos"
          tono={datos.sinIniciar > 0 ? "warn" : "good"}
        />
      </div>

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
                <Fila key={p.id} p={p} indice={i} />
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
      </p>
    </section>
  );
}

function Fila({ p, indice }: { p: ProductoInventario; indice: number }) {
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
    <tr
      className={cn("anim-in border-b border-line last:border-none hover:bg-hover")}
      style={{ animationDelay: `${Math.min(indice, 20) * 20}ms` }}
    >
      <td className="px-4 py-2.5">
        <b className="block text-[13.5px] font-semibold">{p.nombre}</b>
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
          </span>
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
