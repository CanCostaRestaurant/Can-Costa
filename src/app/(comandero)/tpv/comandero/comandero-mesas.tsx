"use client";

// COMANDERO · pantalla 1: LAS MESAS. Pensada para el móvil del camarero: de
// un vistazo qué mesas están abiertas, cuánto llevan y — lo importante — si
// alguna tiene platos marcados y sin enviar a cocina. Tocar = entrar.
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, LayoutDashboard, LogOut, RefreshCw, ShoppingBag, Tablet, Users } from "lucide-react";
import type { MapaMesasTpv, MesaEstado } from "@/lib/db/queries";
import { cn, eur } from "@/lib/utils";
import { abrirTicket } from "@/app/(app)/tpv/actions";
import { cerrarSesion } from "@/app/login/actions";
import { Hoja } from "./comandero-ui";

export type UsuarioComandero = { nombre: string; rol: string };

// "12 min", "1 h 05", "+1 día": un ticket olvidado de otro día no necesita
// enseñar 1500 h.
export function tiempoAbierto(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 24 * 60) return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")}`;
  const dias = Math.floor(minutos / (24 * 60));
  return dias === 1 ? "+1 día" : `+${dias} días`;
}

export function ComanderoMesas({ mapa, usuario }: { mapa: MapaMesasTpv; usuario: UsuarioComandero }) {
  const router = useRouter();
  const [abriendo, startAbrir] = useTransition();
  const [abriendoId, setAbriendoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  // Otro camarero puede abrir mesas desde su móvil o desde la tablet:
  // refresco cada 15 s mientras la pantalla está a la vista y al volver a la app.
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(refrescar, 15_000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [router]);

  function abrir(mesa: MesaEstado | null) {
    setError(null);
    if (mesa?.ticket) {
      router.push(`/tpv/comandero?ticket=${mesa.ticket.id}`);
      return;
    }
    setAbriendoId(mesa?.id ?? "llevar");
    startAbrir(async () => {
      const res = await abrirTicket(mesa?.id ?? null);
      if (!res.ok || !res.id) {
        setAbriendoId(null);
        setError(res.error ?? "No se pudo abrir la mesa");
        return;
      }
      router.push(`/tpv/comandero?ticket=${res.id}`);
    });
  }

  const todas = mapa.zonas.flatMap((z) => z.mesas);
  const abiertas = todas.filter((m) => m.ticket).length + mapa.paraLlevar.length;
  const sinEnviar =
    todas.filter((m) => (m.ticket?.porEnviar ?? 0) > 0).length + mapa.paraLlevar.filter((t) => t.porEnviar > 0).length;

  return (
    <section className="mx-auto max-w-lg px-3.5 pt-[max(12px,env(safe-area-inset-top))] pb-10">
      <header className="mb-4 flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <Flame className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[20px] leading-tight font-bold tracking-tight">Comandero</h1>
          <p className="truncate text-[12.5px] leading-tight text-ink-soft">
            {abiertas === 0
              ? "Ninguna mesa abierta · toca una para empezar"
              : `${abiertas} ${abiertas === 1 ? "abierta" : "abiertas"}${
                  sinEnviar > 0 ? ` · ${sinEnviar} sin enviar a cocina` : ""
                }`}
          </p>
        </div>
        <button
          onClick={() => setMenu(true)}
          aria-label="Menú"
          className="font-display grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-[15px] font-bold text-white active:opacity-80"
        >
          {usuario.nombre.slice(0, 1).toUpperCase()}
        </button>
      </header>

      {error && (
        <div className="mb-3.5 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] font-semibold text-bad">{error}</div>
      )}

      {mapa.zonas.map((zona) => (
        <div key={zona.zona} className="mb-5">
          <h2 className="mb-2 text-[11.5px] font-bold tracking-[0.18em] text-ink-soft uppercase">{zona.titulo}</h2>
          <div className="grid grid-cols-3 gap-2">
            {zona.mesas.map((mesa) => (
              <TarjetaMesa
                key={mesa.id}
                mesa={mesa}
                abriendo={abriendoId === mesa.id}
                bloqueado={abriendo}
                onAbrir={() => abrir(mesa)}
              />
            ))}
          </div>
        </div>
      ))}

      <h2 className="mb-2 text-[11.5px] font-bold tracking-[0.18em] text-ink-soft uppercase">Para llevar</h2>
      <div className="flex flex-col gap-2">
        {mapa.paraLlevar.map((t) => (
          <button
            key={t.id}
            onClick={() => router.push(`/tpv/comandero?ticket=${t.id}`)}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-brand px-4 text-white shadow-(--shadow-lift) transition-transform active:scale-[0.98]"
          >
            <ShoppingBag className="size-5" />
            <span className="font-display text-[16px] font-bold">{eur(t.total)}</span>
            {t.porEnviar > 0 ? (
              <Pastilla tono="blanca">{t.porEnviar} sin enviar</Pastilla>
            ) : (
              <Pastilla>{tiempoAbierto(t.minutos)}</Pastilla>
            )}
          </button>
        ))}
        <button
          onClick={() => abrir(null)}
          disabled={abriendo}
          className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-card text-[14px] font-bold text-ink-soft active:bg-chip"
        >
          <ShoppingBag className="size-4.5" /> {abriendoId === "llevar" ? "Abriendo…" : "Nuevo para llevar"}
        </button>
      </div>

      <Hoja titulo={usuario.nombre} abierta={menu} onCerrar={() => setMenu(false)}>
        <div className="flex flex-col gap-1.5 px-4 pb-2">
          <FilaMenu
            icono={RefreshCw}
            onClick={() => {
              setMenu(false);
              router.refresh();
            }}
          >
            Actualizar mesas
          </FilaMenu>
          <FilaMenu icono={Tablet} href="/tpv?tablet=1">
            TPV completo · cobrar y caja
          </FilaMenu>
          {usuario.rol === "admin" && (
            <FilaMenu icono={LayoutDashboard} href="/">
              Ir al CRM
            </FilaMenu>
          )}
          <FilaMenu icono={LogOut} tono="malo" onClick={() => cerrarSesion()}>
            Cerrar sesión
          </FilaMenu>
        </div>
      </Hoja>
    </section>
  );
}

function TarjetaMesa({
  mesa,
  abriendo,
  bloqueado,
  onAbrir,
}: {
  mesa: MesaEstado;
  abriendo: boolean;
  bloqueado: boolean;
  onAbrir: () => void;
}) {
  const t = mesa.ticket;
  return (
    <button
      onClick={onAbrir}
      disabled={bloqueado}
      className={cn(
        "relative flex min-h-24 cursor-pointer flex-col justify-between rounded-2xl p-3 text-left transition-transform active:scale-[0.96]",
        t ? "bg-brand text-white shadow-(--shadow-lift)" : "border border-line bg-card",
      )}
    >
      <b className="font-display block w-full truncate text-[17px] leading-none font-bold">{mesa.nombre}</b>
      {t ? (
        <div>
          <div className="font-display text-[15px] leading-tight font-bold">{eur(t.total)}</div>
          <div className="mt-1.5">
            {t.porEnviar > 0 ? (
              <Pastilla tono="blanca">
                <span className="size-1.5 animate-pulse rounded-full bg-brand" />
                {t.porEnviar} sin enviar
              </Pastilla>
            ) : (
              <Pastilla>{tiempoAbierto(t.minutos)}</Pastilla>
            )}
          </div>
        </div>
      ) : (
        <span className="flex items-center gap-1 text-[12px] font-semibold text-ink-soft">
          Libre · <Users className="size-3" /> {mesa.capacidad}
        </span>
      )}
      {abriendo && (
        <span className="absolute inset-0 grid place-items-center rounded-2xl bg-paper/80 text-[12.5px] font-bold text-ink">
          Abriendo…
        </span>
      )}
    </button>
  );
}

function Pastilla({ children, tono }: { children: React.ReactNode; tono?: "blanca" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
        tono === "blanca" ? "bg-white text-brand" : "bg-white/20 text-white",
      )}
    >
      {children}
    </span>
  );
}

function FilaMenu({
  icono: Icono,
  children,
  href,
  onClick,
  tono,
}: {
  icono: typeof RefreshCw;
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  tono?: "malo";
}) {
  const clase = cn(
    "flex min-h-13 w-full cursor-pointer items-center gap-3 rounded-2xl border border-line bg-card px-4 text-left text-[14.5px] font-semibold active:bg-chip",
    tono === "malo" && "text-bad",
  );
  if (href) {
    return (
      <Link href={href} className={clase}>
        <Icono className="size-4.5" /> {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={clase}>
      <Icono className="size-4.5" /> {children}
    </button>
  );
}
