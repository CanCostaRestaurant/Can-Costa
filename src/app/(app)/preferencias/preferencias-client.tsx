"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Chip, PageHead } from "@/components/ui";
import { type RolUsuario } from "@/lib/auth";
import { type Ajustes, type UsuarioFila } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { actualizarUsuario, crearUsuario, eliminarUsuario, guardarAjustes } from "./actions";

const ROLES: { valor: RolUsuario; etiqueta: string; descripcion: string }[] = [
  { valor: "admin", etiqueta: "Administrador", descripcion: "gestiona todo: dashboard, documentos, TPV, reservas…" },
  { valor: "documentos", etiqueta: "Documentos", descripcion: "solo añade, ve y edita documentos (quien recepciona)" },
  { valor: "gestor", etiqueta: "Gestor", descripcion: "consulta y descarga (gestoría): sin TPV, reservas ni clientes" },
  { valor: "chef", etiqueta: "Chef", descripcion: "solo escandallos y productos" },
];

export function PreferenciasClient({ ajustes, usuarios }: { ajustes: Ajustes; usuarios: UsuarioFila[] }) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [ivaTexto, setIvaTexto] = useState(String(ajustes.ivaVentasPct));
  const [tolTexto, setTolTexto] = useState(String(ajustes.toleranciaConciliacion));

  // Alta de usuario
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<RolUsuario>("documentos");
  const [contrasena, setContrasena] = useState("");
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startAccion(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="anim-in">
      <PageHead
        titulo="Preferencias"
        subtitulo="Cómo quieres que opere Can Costa, y quién entra con qué acceso"
      />

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 items-start gap-3.5 max-lg:grid-cols-1">
        {/* ── Ajustes del sistema ── */}
        <div className="card p-5.5">
          <h3 className="mb-4 font-display text-base font-bold tracking-tight">Sistema</h3>
          <div className="flex flex-col gap-4">
            <Ajuste
              titulo="Dashboard con IVA"
              detalle="ver la información general con IVA o sin IVA (base imponible)"
            >
              <Toggle activo={ajustes.conIva} onCambio={(v) => ejecutar(() => guardarAjustes({ conIva: v }))} />
            </Ajuste>
            <Ajuste titulo="Ventas con el total" detalle="mostrar las ventas con el total cobrado o con la base">
              <Toggle
                activo={ajustes.ventasConTotal}
                onCambio={(v) => ejecutar(() => guardarAjustes({ ventasConTotal: v }))}
              />
            </Ajuste>
            <Ajuste
              titulo="IVA automático de las ventas"
              detalle="el % que se descuenta al calcular la base de las ventas (hostelería: 10%)"
            >
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  value={ivaTexto}
                  onChange={(e) => setIvaTexto(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(ivaTexto.replace(",", "."));
                    if (Number.isFinite(v) && v !== ajustes.ivaVentasPct) {
                      ejecutar(() => guardarAjustes({ ivaVentasPct: v }));
                    }
                  }}
                  className="w-16 rounded-lg border border-line bg-card px-2 py-1.5 text-center text-sm font-semibold outline-none focus:border-brand"
                />
                <span className="text-sm text-ink-soft">%</span>
              </span>
            </Ajuste>
            <Ajuste
              titulo="Diferencia aceptable en conciliaciones"
              detalle="para las conciliaciones recomendadas (cuando activemos Conciliación)"
            >
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={tolTexto}
                  onChange={(e) => setTolTexto(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(tolTexto.replace(",", "."));
                    if (Number.isFinite(v) && v !== ajustes.toleranciaConciliacion) {
                      ejecutar(() => guardarAjustes({ toleranciaConciliacion: v }));
                    }
                  }}
                  className="w-16 rounded-lg border border-line bg-card px-2 py-1.5 text-center text-sm font-semibold outline-none focus:border-brand"
                />
                <span className="text-sm text-ink-soft">€</span>
              </span>
            </Ajuste>
          </div>
        </div>

        {/* ── Usuarios y roles ── */}
        <div className="card p-5.5">
          <h3 className="font-display text-base font-bold tracking-tight">
            Usuarios <span className="font-body text-[12.5px] font-normal text-ink-soft">· hasta 7, cada uno con su contraseña</span>
          </h3>
          <p className="mt-1 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
            En el login basta la contraseña: con ella Can Costa sabe quién es y qué puede ver.
          </p>

          <div className="flex flex-col gap-2">
            {usuarios.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-chip text-[13px] font-bold uppercase">
                  {u.nombre.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <b className={cn("block truncate text-[13.5px] font-semibold", !u.activo && "line-through opacity-50")}>
                    {u.nombre}
                  </b>
                  <small className="text-[11.5px] text-ink-soft">desde {u.creado}</small>
                </div>
                <select
                  value={u.rol}
                  onChange={(e) => ejecutar(() => actualizarUsuario(u.id, { rol: e.target.value as RolUsuario }))}
                  className="rounded-lg border border-line bg-card px-2 py-1 text-[12.5px] font-semibold outline-none focus:border-brand"
                >
                  {ROLES.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.etiqueta}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => ejecutar(() => actualizarUsuario(u.id, { activo: !u.activo }))}
                  className="cursor-pointer"
                  title={u.activo ? "Desactivar acceso" : "Reactivar acceso"}
                >
                  {u.activo ? <Chip tone="good">activo</Chip> : <Chip tone="gray">sin acceso</Chip>}
                </button>
                <button
                  onClick={() => {
                    if (borrandoId !== u.id) {
                      setBorrandoId(u.id);
                      setTimeout(() => setBorrandoId(null), 4000);
                      return;
                    }
                    ejecutar(() => eliminarUsuario(u.id));
                  }}
                  title={borrandoId === u.id ? "Otra vez para borrar" : "Eliminar usuario"}
                  className={cn(
                    "cursor-pointer rounded-lg p-1.5 transition-colors",
                    borrandoId === u.id ? "bg-bad text-white" : "text-ink-soft hover:bg-bad-soft hover:text-bad",
                  )}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {usuarios.length === 0 && (
              <p className="rounded-xl bg-chip px-3.5 py-3 text-[13px] text-ink-soft">
                De momento solo entra el propietario (contraseña maestra). Crea aquí a tu equipo.
              </p>
            )}
          </div>

          {/* Alta */}
          <div className="mt-4 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                placeholder="Nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-[13.5px] outline-none focus:border-brand"
              />
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value as RolUsuario)}
                className="rounded-xl border border-line bg-card px-2.5 py-2 text-[13px] font-semibold outline-none focus:border-brand"
              >
                {ROLES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
              <input
                placeholder="Contraseña"
                type="text"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                className="w-32 rounded-xl border border-line bg-card px-3 py-2 text-[13.5px] outline-none focus:border-brand"
              />
              <button
                onClick={() =>
                  ejecutar(async () => {
                    const res = await crearUsuario({ nombre, rol, contrasena });
                    if (res.ok) {
                      setNombre("");
                      setContrasena("");
                    }
                    return res;
                  })
                }
                disabled={!nombre.trim() || contrasena.length < 6 || ocupado || usuarios.length >= 7}
                className="inline-flex cursor-pointer items-center gap-1 rounded-xl bg-ink px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
              >
                <Plus className="size-4" /> Crear
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-ink-soft">
              {ROLES.find((r) => r.valor === rol)?.descripcion}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Ajuste({ titulo, detalle, children }: { titulo: string; detalle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <b className="block text-[13.5px] font-semibold">{titulo}</b>
        <small className="text-[12px] leading-snug text-ink-soft">{detalle}</small>
      </div>
      {children}
    </div>
  );
}

function Toggle({ activo, onCambio }: { activo: boolean; onCambio: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onCambio(!activo)}
      className={cn(
        "relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors",
        activo ? "bg-good" : "bg-chip",
      )}
      role="switch"
      aria-checked={activo}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
          activo ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}
