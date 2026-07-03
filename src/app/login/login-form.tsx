"use client";

import { useActionState } from "react";
import { iniciarSesion } from "./actions";

export function LoginForm() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, null);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
        Usuario
        <input
          type="text"
          name="usuario"
          required
          autoFocus
          autoComplete="username"
          className="card mt-1.5 w-full rounded-xl! px-3.5 py-2.5 font-body text-[15px] font-normal tracking-normal outline-none focus:border-brand"
        />
      </label>
      <label className="text-[12.5px] font-semibold tracking-wider text-ink-soft uppercase">
        Contraseña
        <input
          type="password"
          name="contrasena"
          required
          autoComplete="current-password"
          className="card mt-1.5 w-full rounded-xl! px-3.5 py-2.5 font-body text-[15px] font-normal tracking-normal outline-none focus:border-brand"
        />
      </label>
      {estado?.error && (
        <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-[13px] font-semibold text-bad">
          {estado.error}
        </p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="cursor-pointer rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
