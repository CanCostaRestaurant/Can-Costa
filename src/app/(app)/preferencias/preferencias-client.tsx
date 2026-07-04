"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Plus, Trash2 } from "lucide-react";
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
            Cada uno entra con su usuario y su contraseña. Clica el nombre para renombrarlo y la
            llave para cambiarle la contraseña.
          </p>

          <div className="flex flex-col gap-2">
            {usuarios.map((u) => (
              <FilaUsuario
                key={u.id}
                usuario={u}
                ocupado={ocupado}
                borrando={borrandoId === u.id}
                onEjecutar={ejecutar}
                onPedirBorrado={() => {
                  setBorrandoId(u.id);
                  setTimeout(() => setBorrandoId(null), 4000);
                }}
              />
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

      {/* ── Datos del ticket de venta ── */}
      <div className="card mt-3.5 p-5.5">
        <h3 className="font-display text-base font-bold tracking-tight">Datos del ticket</h3>
        <p className="mt-1 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
          Salen impresos en el ticket que se da al cliente al cobrar en el TPV.
        </p>
        <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
          <CampoTicket
            etiqueta="Nombre fiscal"
            valor={ajustes.nombreFiscal}
            placeholder="Can Costa SL"
            onGuardar={(v) => ejecutar(() => guardarAjustes({ nombreFiscal: v }))}
          />
          <CampoTicket
            etiqueta="CIF / NIF"
            valor={ajustes.cif}
            placeholder="B12345678"
            onGuardar={(v) => ejecutar(() => guardarAjustes({ cif: v }))}
          />
          <CampoTicket
            etiqueta="Dirección"
            valor={ajustes.direccion}
            placeholder="C/ Exemple 12, Barcelona"
            onGuardar={(v) => ejecutar(() => guardarAjustes({ direccion: v }))}
          />
          <CampoTicket
            etiqueta="Teléfono"
            valor={ajustes.telefono}
            placeholder="931 23 45 67"
            onGuardar={(v) => ejecutar(() => guardarAjustes({ telefono: v }))}
          />
          <div className="col-span-2 max-md:col-span-1">
            <CampoTicket
              etiqueta="Mensaje de pie"
              valor={ajustes.pieTicket}
              placeholder="¡Gracias por su visita!"
              onGuardar={(v) => ejecutar(() => guardarAjustes({ pieTicket: v }))}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function CampoTicket({
  etiqueta,
  valor,
  placeholder,
  onGuardar,
}: {
  etiqueta: string;
  valor: string | null;
  placeholder: string;
  onGuardar: (v: string) => void;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  return (
    <label className="block text-[11.5px] font-semibold tracking-wider text-ink-soft uppercase">
      {etiqueta}
      <input
        value={texto}
        placeholder={placeholder}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => texto !== (valor ?? "") && onGuardar(texto)}
        className="mt-1 block w-full rounded-xl border border-line bg-card px-3 py-2 font-body text-[14px] font-normal tracking-normal outline-none focus:border-brand"
      />
    </label>
  );
}

function FilaUsuario({
  usuario: u,
  ocupado,
  borrando,
  onEjecutar,
  onPedirBorrado,
}: {
  usuario: UsuarioFila;
  ocupado: boolean;
  borrando: boolean;
  onEjecutar: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  onPedirBorrado: () => void;
}) {
  const [nombre, setNombre] = useState(u.nombre);
  const [cambiandoPass, setCambiandoPass] = useState(false);
  const [nuevaPass, setNuevaPass] = useState("");

  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-chip text-[13px] font-bold uppercase">
          {u.nombre.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => {
              if (nombre.trim() && nombre.trim() !== u.nombre) {
                onEjecutar(() => actualizarUsuario(u.id, { nombre }));
              } else {
                setNombre(u.nombre);
              }
            }}
            aria-label={`Nombre de ${u.nombre}`}
            className={cn(
              "block w-full truncate border-b border-transparent bg-transparent text-[13.5px] font-semibold outline-none transition-colors hover:border-line focus:border-brand",
              !u.activo && "line-through opacity-50",
            )}
          />
          <small className="text-[11.5px] text-ink-soft">desde {u.creado}</small>
        </div>
        <select
          value={u.rol}
          onChange={(e) => onEjecutar(() => actualizarUsuario(u.id, { rol: e.target.value as RolUsuario }))}
          className="rounded-lg border border-line bg-card px-2 py-1 text-[12.5px] font-semibold outline-none focus:border-brand"
        >
          {ROLES.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.etiqueta}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setCambiandoPass((v) => !v);
            setNuevaPass("");
          }}
          title="Cambiar contraseña"
          className={cn(
            "cursor-pointer rounded-lg p-1.5 transition-colors",
            cambiandoPass ? "bg-ink text-white" : "text-ink-soft hover:bg-chip hover:text-ink",
          )}
        >
          <KeyRound className="size-4" />
        </button>
        <button
          onClick={() => onEjecutar(() => actualizarUsuario(u.id, { activo: !u.activo }))}
          className="cursor-pointer"
          title={u.activo ? "Desactivar acceso" : "Reactivar acceso"}
        >
          {u.activo ? <Chip tone="good">activo</Chip> : <Chip tone="gray">sin acceso</Chip>}
        </button>
        <button
          onClick={() => {
            if (!borrando) {
              onPedirBorrado();
              return;
            }
            onEjecutar(() => eliminarUsuario(u.id));
          }}
          title={borrando ? "Otra vez para borrar" : "Eliminar usuario"}
          className={cn(
            "cursor-pointer rounded-lg p-1.5 transition-colors",
            borrando ? "bg-bad text-white" : "text-ink-soft hover:bg-bad-soft hover:text-bad",
          )}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {cambiandoPass && (
        <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
          <input
            type="text"
            placeholder={`Nueva contraseña de ${u.nombre} (mín. 6)`}
            value={nuevaPass}
            onChange={(e) => setNuevaPass(e.target.value)}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
          />
          <button
            onClick={() =>
              onEjecutar(async () => {
                const res = await actualizarUsuario(u.id, { contrasena: nuevaPass });
                if (res.ok) {
                  setCambiandoPass(false);
                  setNuevaPass("");
                }
                return res;
              })
            }
            disabled={nuevaPass.length < 6 || ocupado}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            <Check className="size-3.5" /> Guardar
          </button>
        </div>
      )}
    </div>
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
