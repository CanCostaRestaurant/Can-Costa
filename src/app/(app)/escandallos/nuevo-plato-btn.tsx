"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearPlato } from "./actions";

export function NuevoPlatoBtn() {
  const router = useRouter();
  const [creando, startCrear] = useTransition();

  function onCrear(tipo?: "bebida" | "postre") {
    startCrear(async () => {
      const res = await crearPlato(tipo);
      if (res.ok && res.id) router.push(`/escandallos/${res.id}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onCrear("postre")}
        disabled={creando}
        className="cursor-pointer rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:border-brand disabled:opacity-60"
      >
        + Nuevo postre
      </button>
      <button
        onClick={() => onCrear("bebida")}
        disabled={creando}
        className="cursor-pointer rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:border-brand disabled:opacity-60"
      >
        + Nueva bebida
      </button>
      <button
        onClick={() => onCrear()}
        disabled={creando}
        className="cursor-pointer rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
      >
        {creando ? "Creando…" : "+ Nuevo plato"}
      </button>
    </div>
  );
}
