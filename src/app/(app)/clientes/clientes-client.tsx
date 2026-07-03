"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Star } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { normalizarNombre } from "@/lib/clientes/identidad";
import { type ClienteResumen } from "@/lib/db/queries";
import { actualizarCliente } from "./actions";

export function ClientesClient({ clientes }: { clientes: ClienteResumen[] }) {
  const router = useRouter();
  const [, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const q = normalizarNombre(busqueda);
    if (!q) return clientes;
    return clientes.filter((c) =>
      normalizarNombre(`${c.nombre} ${c.telefono ?? ""} ${c.email ?? ""}`).includes(q),
    );
  }, [clientes, busqueda]);

  function guardar(id: string, datos: Parameters<typeof actualizarCliente>[1]) {
    setError(null);
    startAccion(async () => {
      const res = await actualizarCliente(id, datos);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      router.refresh();
    });
  }

  const habituales = clientes.filter((c) => c.numReservas >= 2).length;

  return (
    <section className="anim-in">
      <PageHead
        titulo="Clientes"
        subtitulo="Se crean solos con cada reserva; si vuelven, los reconocemos por teléfono, email o nombre completo"
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="mb-3.5 grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
        <Kpi etiqueta="Clientes" valor={String(clientes.length)}>
          en la base de datos
        </Kpi>
        <Kpi etiqueta="Habituales" valor={String(habituales)}>
          con 2 o más reservas
        </Kpi>
        <Kpi
          etiqueta="No-shows"
          valor={String(clientes.reduce((a, c) => a + c.noShows, 0))}
        >
          plantones acumulados
        </Kpi>
      </div>

      <div className="card mb-3.5 flex items-center gap-2.5 rounded-xl! px-3.5 py-2.5">
        <Search className="size-[17px] text-ink-soft" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email…"
          className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-soft/60"
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Contacto</Th>
              <Th>Reservas</Th>
              <Th>Visitas</Th>
              <Th>No-shows</Th>
              <Th>Última</Th>
              <Th>Notas</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.id} className="border-b border-line align-middle last:border-none hover:bg-hover">
                <td className="px-3.5 py-2.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {c.nombre}
                    {c.numReservas >= 2 && <Star className="size-3.5 fill-warn text-warn" />}
                  </span>
                </td>
                <td className="px-3.5 py-2.5">
                  <CampoInline
                    valorInicial={c.telefono ?? ""}
                    placeholder="teléfono"
                    onGuardar={(v) => guardar(c.id, { telefono: v })}
                  />
                  <CampoInline
                    valorInicial={c.email ?? ""}
                    placeholder="email"
                    onGuardar={(v) => guardar(c.id, { email: v })}
                  />
                </td>
                <td className="px-3.5 py-2.5 font-display text-[15px] font-bold">{c.numReservas}</td>
                <td className="px-3.5 py-2.5 font-display text-[15px] font-bold text-good">{c.visitas}</td>
                <td className="px-3.5 py-2.5">
                  {c.noShows > 0 ? <Chip tone="bad">{c.noShows}</Chip> : <span className="text-ink-soft">—</span>}
                </td>
                <td className="px-3.5 py-2.5 text-sm text-ink-soft">{c.ultimaReserva}</td>
                <td className="px-3.5 py-2.5">
                  <CampoInline
                    valorInicial={c.notas ?? ""}
                    placeholder="alergias, VIP, mesa favorita…"
                    ancho="w-52"
                    onGuardar={(v) => guardar(c.id, { notas: v })}
                  />
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-soft">
                  {clientes.length === 0
                    ? "Aún no hay clientes: se crearán solos con la primera reserva."
                    : "Nadie coincide con la búsqueda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CampoInline({
  valorInicial,
  placeholder,
  ancho = "w-40",
  onGuardar,
}: {
  valorInicial: string;
  placeholder: string;
  ancho?: string;
  onGuardar: (v: string) => void;
}) {
  const [texto, setTexto] = useState(valorInicial);
  return (
    <input
      value={texto}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto !== valorInicial && onGuardar(texto)}
      className={`${ancho} block rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-ink-soft/50 hover:border-line focus:border-brand`}
    />
  );
}

function Kpi({ etiqueta, valor, children }: { etiqueta: string; valor: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">{etiqueta}</div>
      <div className="mt-1.5 font-display text-[28px] font-bold tracking-tight">{valor}</div>
      <div className="mt-1 text-[12.5px] text-ink-soft">{children}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-line px-3.5 py-2.5 text-left text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {children}
    </th>
  );
}
