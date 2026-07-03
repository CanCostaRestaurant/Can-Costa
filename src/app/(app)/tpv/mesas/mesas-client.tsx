"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { actualizarMesa, crearMesa } from "../actions";

export type MesaFila = {
  id: string;
  nombre: string;
  zona: "sala" | "terraza" | "barra";
  capacidad: number;
  activo: boolean;
};

const ZONAS: { id: "sala" | "terraza" | "barra"; nombre: string }[] = [
  { id: "sala", nombre: "Sala" },
  { id: "terraza", nombre: "Terraza" },
  { id: "barra", nombre: "Barra" },
];

export function MesasClient({ mesas }: { mesas: MesaFila[] }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaZona, setNuevaZona] = useState<"sala" | "terraza" | "barra">("sala");
  const [nuevaCap, setNuevaCap] = useState("4");

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>, alTerminar?: () => void) {
    setError(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      if (alTerminar) alTerminar();
      router.refresh();
    });
  }

  return (
    <>
      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="card mb-3.5 flex flex-wrap items-end gap-3 p-4">
        <label className="flex-1 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Nueva mesa
          <input
            placeholder="Mesa 7, Reservado, Barra 3…"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-card px-3.5 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
          />
        </label>
        <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Zona
          <select
            value={nuevaZona}
            onChange={(e) => setNuevaZona(e.target.value as typeof nuevaZona)}
            className="mt-1.5 block rounded-xl border border-line bg-card px-3.5 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
          >
            {ZONAS.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
          Capacidad
          <input
            type="number"
            min="1"
            max="30"
            value={nuevaCap}
            onChange={(e) => setNuevaCap(e.target.value)}
            className="mt-1.5 block w-24 rounded-xl border border-line bg-card px-3.5 py-2.5 font-body text-[14.5px] font-normal tracking-normal outline-none focus:border-brand"
          />
        </label>
        <button
          onClick={() =>
            ejecutar(
              () => crearMesa({ nombre: nuevoNombre, zona: nuevaZona, capacidad: parseInt(nuevaCap, 10) }),
              () => setNuevoNombre(""),
            )
          }
          disabled={!nuevoNombre.trim() || ocupado}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
        >
          <Plus className="size-4" /> Añadir
        </button>
      </div>

      {ZONAS.map((zona) => {
        const deZona = mesas.filter((m) => m.zona === zona.id);
        if (deZona.length === 0) return null;
        return (
          <div key={zona.id} className="mb-5">
            <h3 className="mb-2 text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
              {zona.nombre}
            </h3>
            <div className="card overflow-hidden">
              {deZona.map((mesa) => (
                <div
                  key={mesa.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-none",
                    !mesa.activo && "opacity-45",
                  )}
                >
                  <CampoTexto
                    valorInicial={mesa.nombre}
                    onGuardar={(v) => ejecutar(() => actualizarMesa(mesa.id, { nombre: v }))}
                  />
                  <select
                    value={mesa.zona}
                    onChange={(e) =>
                      ejecutar(() => actualizarMesa(mesa.id, { zona: e.target.value as MesaFila["zona"] }))
                    }
                    className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                  >
                    {ZONAS.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nombre}
                      </option>
                    ))}
                  </select>
                  <span className="flex items-center gap-1.5 text-sm text-ink-soft">
                    <Users className="size-4" />
                    <CampoNumero
                      valorInicial={mesa.capacidad}
                      onGuardar={(v) => ejecutar(() => actualizarMesa(mesa.id, { capacidad: v }))}
                    />
                  </span>
                  <button
                    onClick={() => ejecutar(() => actualizarMesa(mesa.id, { activo: !mesa.activo }))}
                    className={cn(
                      "ml-auto cursor-pointer rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                      mesa.activo ? "bg-good-soft text-good hover:bg-bad-soft hover:text-bad" : "bg-chip text-ink-soft",
                    )}
                  >
                    {mesa.activo ? "activa" : "desactivada"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function CampoTexto({ valorInicial, onGuardar }: { valorInicial: string; onGuardar: (v: string) => void }) {
  const [texto, setTexto] = useState(valorInicial);
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto.trim() && texto !== valorInicial && onGuardar(texto)}
      className="w-40 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold outline-none hover:border-line focus:border-brand"
    />
  );
}

function CampoNumero({ valorInicial, onGuardar }: { valorInicial: number; onGuardar: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valorInicial));
  return (
    <input
      type="number"
      min="1"
      max="30"
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const v = parseInt(texto, 10);
        if (Number.isFinite(v) && v !== valorInicial) onGuardar(v);
      }}
      className="w-14 rounded-lg border border-line bg-card px-2 py-1 text-center text-sm outline-none focus:border-brand"
    />
  );
}
