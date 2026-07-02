import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { getProductosConHistorico } from "@/lib/db/queries";
import { type Producto } from "@/lib/mock";

export const dynamic = "force-dynamic";

const EMOJI_FAMILIA: Record<Producto["familia"], string> = {
  pescado: "🐟",
  carne: "🥩",
  "fruta-verdura": "🥑",
  seco: "🫒",
  bebida: "🥤",
  otros: "📦",
};

export default async function IncidenciasPage() {
  const productos = await getProductosConHistorico();
  const subidas = productos.filter((p) => p.variacion > 0).sort((a, b) => b.variacion - a.variacion);
  const bajadas = productos.filter((p) => p.variacion < 0).sort((a, b) => a.variacion - b.variacion);

  return (
    <section className="anim-in">
      <PageHead
        titulo="Incidencias de precio"
        subtitulo="Cambios detectados al validar tus últimas facturas"
      />

      {subidas.length > 0 && (
        <div className="mb-3.5 flex items-center gap-3 rounded-[14px] border border-[#EED9AC] bg-warn-soft px-4 py-3 text-[13.5px] leading-relaxed text-[#7A5106]">
          <TriangleAlert className="size-5 shrink-0 text-warn" />
          <div>
            <b>{subidas.length}</b> {subidas.length === 1 ? "producto ha subido" : "productos han subido"} de
            precio. Revisa los escandallos que los usan.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 items-start gap-3.5 max-md:grid-cols-1">
        <Panel titulo="Subidas" vacio="Sin subidas de precio ahora mismo 🎉" items={subidas} tono="bad" />
        <Panel titulo="Bajadas" vacio="Sin bajadas registradas." items={bajadas} tono="good" />
      </div>
    </section>
  );
}

function Panel({
  titulo,
  vacio,
  items,
  tono,
}: {
  titulo: string;
  vacio: string;
  items: Producto[];
  tono: "bad" | "good";
}) {
  return (
    <div className="card p-5.5 pb-3">
      <h3 className="mb-2 flex items-center gap-2 font-display text-base font-bold tracking-tight">
        {titulo}
        <span
          className={
            "rounded-full px-2 py-0.5 font-body text-[11.5px] " +
            (tono === "bad" ? "bg-bad-soft text-bad" : "bg-good-soft text-good")
          }
        >
          {items.length}
        </span>
      </h3>
      {items.map((p) => {
        const previo = p.hist.length > 1 ? p.hist[p.hist.length - 2] : null;
        const unidad = p.precio.split("/")[1] ?? "ud";
        return (
          <Link
            key={p.id}
            href="/productos"
            className="-mx-2 flex items-center gap-3 rounded-lg border-b border-line px-2 py-2.5 last:border-none hover:bg-hover"
          >
            <div
              className={
                "grid size-[34px] shrink-0 place-items-center rounded-[10px] text-[15px] " +
                (tono === "bad" ? "bg-bad-soft" : "bg-good-soft")
              }
            >
              {EMOJI_FAMILIA[p.familia]}
            </div>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-semibold">{p.nombre}</b>
              <small className="text-xs text-ink-soft">
                {p.proveedor} ·{" "}
                {previo !== null
                  ? `${previo.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €/${unidad} → ${p.precio}`
                  : p.precio}{" "}
                · {p.ultimaCompra}
              </small>
            </div>
            <Chip tone={tono}>
              {p.variacion > 0 ? "▲ +" : "▼ "}
              {p.variacion}%
            </Chip>
          </Link>
        );
      })}
      {items.length === 0 && <p className="pb-2.5 text-[13.5px] text-ink-soft">{vacio}</p>}
    </div>
  );
}
