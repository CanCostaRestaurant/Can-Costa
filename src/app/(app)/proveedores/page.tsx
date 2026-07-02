import { PageHead } from "@/components/ui";
import { getProveedoresResumen } from "@/lib/db/queries";
import { eur } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  const proveedores = await getProveedoresResumen();

  return (
    <section className="anim-in">
      <PageHead
        titulo="Proveedores"
        subtitulo="A quién compras y cuánto, según tus facturas"
      />

      <div className="card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Proveedor</Th>
              <Th>Facturas</Th>
              <Th>Gasto acumulado</Th>
              <Th>Última compra</Th>
            </tr>
          </thead>
          <tbody>
            {proveedores.map((p) => (
              <tr key={p.id} className="border-b border-line transition-colors last:border-none hover:bg-hover">
                <td className="px-3.5 py-3 text-sm">
                  <span className="font-semibold">{p.nombre}</span>
                  <span className="mt-px block text-xs text-ink-soft">
                    {p.email ?? p.telefono ?? "sin datos de contacto"}
                  </span>
                </td>
                <td className="px-3.5 py-3 text-sm">{p.numFacturas}</td>
                <td className="px-3.5 py-3 font-display text-[14.5px] font-semibold">{eur(p.gastoTotal)}</td>
                <td className="px-3.5 py-3 text-sm text-ink-soft">{p.ultimaCompra}</td>
              </tr>
            ))}
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3.5 py-8 text-center text-sm text-ink-soft">
                  Los proveedores se crean solos al validar tus primeras facturas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}
