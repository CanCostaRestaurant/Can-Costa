"use client";

// Tabla estilo JOMA: por cada trabajador activo, sus columnas del mes
// (Líquido, IRPF, SS Trabajador, SS Empresa, Cash/B, Coste Empresa).
// Editas cualquier celda inline y se guarda al salir del campo.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ui";
import { type GastoPersonal, type Trabajador } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { actualizarCategoriaTrabajador, guardarNominaDesglose } from "./actions-desglose";

type Desglose = {
  liquido: number | null;
  irpf: number | null;
  ssTrab: number | null;
  ssEmp: number | null;
  cashB: number | null;
};

const CERO: Desglose = { liquido: null, irpf: null, ssTrab: null, ssEmp: null, cashB: null };

function costeEmpresa(d: Desglose): number {
  return (d.liquido ?? 0) + (d.irpf ?? 0) + (d.ssTrab ?? 0) + (d.ssEmp ?? 0) + (d.cashB ?? 0);
}

function tieneAlgo(d: Desglose): boolean {
  return d.liquido !== null || d.irpf !== null || d.ssTrab !== null || d.ssEmp !== null || d.cashB !== null;
}

export function TablaDesglosePersonal({
  mes,
  trabajadores,
  gastos,
}: {
  mes: string;
  trabajadores: Trabajador[];
  gastos: GastoPersonal[];
}) {
  const activos = trabajadores.filter((t) => t.activo);
  // Nómina del mes por trabajador (si existe): la primera del tipo nómina.
  const porTrabajador = new Map<string, GastoPersonal>();
  for (const g of gastos) {
    if (g.trabajadorId && g.tipo === "nomina" && !porTrabajador.has(g.trabajadorId)) {
      porTrabajador.set(g.trabajadorId, g);
    }
  }

  return (
    <div className="card mt-3.5 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h3 className="font-display text-base font-bold tracking-tight">Plantilla del mes</h3>
          <p className="text-[12px] text-ink-soft">
            {activos.length} activos · edita cualquier importe para guardarlo
          </p>
        </div>
      </div>

      {activos.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-soft">
          Aún no hay trabajadores activos. Añádelos en el bloque de la derecha.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line">
                <Th>Empleado</Th>
                <Th>Categoría</Th>
                <Th right>Líquido</Th>
                <Th right>IRPF</Th>
                <Th right>SS Trabajador</Th>
                <Th right>SS Empresa</Th>
                <Th right>Cash / B</Th>
                <Th right>Coste Empresa</Th>
              </tr>
            </thead>
            <tbody>
              {activos.map((t) => (
                <FilaTrabajador
                  key={t.id}
                  trabajador={t}
                  mes={mes}
                  nomina={porTrabajador.get(t.id) ?? null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaTrabajador({
  trabajador,
  mes,
  nomina,
}: {
  trabajador: Trabajador;
  mes: string;
  nomina: GastoPersonal | null;
}) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();

  const desgloseInicial: Desglose = {
    liquido: nomina?.liquido ?? (nomina?.importe ?? null),
    irpf: nomina?.irpf ?? null,
    ssTrab: nomina?.ssTrabajador ?? null,
    ssEmp: nomina?.ssEmpresa ?? null,
    cashB: nomina?.cashB ?? null,
  };
  const [desglose, setDesglose] = useState<Desglose>(
    nomina?.liquido !== null && nomina?.liquido !== undefined ? desgloseInicial : (nomina ? desgloseInicial : CERO),
  );

  function guardarCampo(campo: keyof Desglose, valor: string) {
    const numero = valor.trim() === "" ? null : parseFloat(valor.replace(",", "."));
    if (numero !== null && (!Number.isFinite(numero) || numero < 0)) return;
    const proximo = { ...desglose, [campo]: numero };
    if (
      proximo.liquido === desglose.liquido &&
      proximo.irpf === desglose.irpf &&
      proximo.ssTrab === desglose.ssTrab &&
      proximo.ssEmp === desglose.ssEmp &&
      proximo.cashB === desglose.cashB
    ) {
      return;
    }
    setDesglose(proximo);
    startAccion(async () => {
      const res = await guardarNominaDesglose(mes, trabajador.id, {
        liquido: proximo.liquido,
        irpf: proximo.irpf,
        ssTrabajador: proximo.ssTrab,
        ssEmpresa: proximo.ssEmp,
        cashB: proximo.cashB,
      });
      if (res.ok) router.refresh();
    });
  }

  function guardarCategoria(nueva: string) {
    if ((nueva || null) === (trabajador.categoria ?? null)) return;
    startAccion(async () => {
      const res = await actualizarCategoriaTrabajador(trabajador.id, nueva || null);
      if (res.ok) router.refresh();
    });
  }

  const coste = costeEmpresa(desglose);
  const hayDatos = tieneAlgo(desglose);

  return (
    <tr className={cn("border-b border-line last:border-none transition-colors", ocupado && "bg-hover/60")}>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">{trabajador.nombre}</span>
          {!hayDatos && (
            <Chip tone="gray">sin nómina del mes</Chip>
          )}
        </div>
        {trabajador.puesto && (
          <div className="text-[11.5px] text-ink-soft">{trabajador.puesto}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <input
          defaultValue={trabajador.categoria ?? ""}
          placeholder="Cocina, Sala…"
          onBlur={(e) => guardarCategoria(e.target.value.trim())}
          className="w-32 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[12.5px] outline-none hover:border-line focus:border-brand"
        />
      </td>
      <CeldaEuro valor={desglose.liquido} onGuardar={(v) => guardarCampo("liquido", v)} />
      <CeldaEuro valor={desglose.irpf} onGuardar={(v) => guardarCampo("irpf", v)} />
      <CeldaEuro valor={desglose.ssTrab} onGuardar={(v) => guardarCampo("ssTrab", v)} />
      <CeldaEuro valor={desglose.ssEmp} onGuardar={(v) => guardarCampo("ssEmp", v)} />
      <CeldaEuro valor={desglose.cashB} onGuardar={(v) => guardarCampo("cashB", v)} />
      <td className="px-4 py-3 text-right font-display font-bold text-ink">
        {hayDatos ? eur(coste) : "—"}
      </td>
    </tr>
  );
}

function CeldaEuro({
  valor,
  onGuardar,
}: {
  valor: number | null;
  onGuardar: (v: string) => void;
}) {
  return (
    <td className="px-2 py-3 text-right">
      <input
        type="number"
        step="0.01"
        min="0"
        defaultValue={valor !== null ? valor.toFixed(2) : ""}
        placeholder="0,00 €"
        onBlur={(e) => onGuardar(e.target.value)}
        className="w-24 rounded-lg border border-transparent bg-transparent px-2 py-1 text-right font-display text-[13px] font-semibold outline-none hover:border-line focus:border-brand"
      />
    </td>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left text-[11px] font-semibold tracking-wider text-ink-soft uppercase",
        right && "text-right",
      )}
    >
      {children}
    </th>
  );
}
