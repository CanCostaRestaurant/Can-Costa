"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearPlato } from "./actions";

export function NuevoPlatoBtn() {
  const router = useRouter();
  const [creando, startCrear] = useTransition();

  function onCrear() {
    startCrear(async () => {
      const res = await crearPlato();
      if (res.ok && res.id) router.push(`/escandallos/${res.id}`);
    });
  }

  return (
    <button
      onClick={onCrear}
      disabled={creando}
      className="cursor-pointer rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
    >
      {creando ? "Creando…" : "+ Nuevo plato"}
    </button>
  );
}
