"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { iniciarSesion } from "./actions";

export function LoginForm() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, null);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <label
        className="anim-in text-[12px] font-semibold tracking-wider text-ink-soft uppercase"
        style={{ animationDelay: "100ms" }}
      >
        Usuario
        <input
          type="text"
          name="usuario"
          required
          autoFocus
          autoComplete="username"
          placeholder="Tu nombre"
          className="mt-1.5 w-full rounded-2xl border border-line bg-card px-4 py-3.5 font-body text-[15.5px] font-normal tracking-normal shadow-(--shadow-card) transition-all outline-none placeholder:text-ink-soft/50 focus:border-brand focus:shadow-[0_0_0_4px_var(--color-brand-soft)]"
        />
      </label>
      <label
        className="anim-in text-[12px] font-semibold tracking-wider text-ink-soft uppercase"
        style={{ animationDelay: "150ms" }}
      >
        Contraseña
        <input
          type="password"
          name="contrasena"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="mt-1.5 w-full rounded-2xl border border-line bg-card px-4 py-3.5 font-body text-[15.5px] font-normal tracking-normal shadow-(--shadow-card) transition-all outline-none placeholder:text-ink-soft/50 focus:border-brand focus:shadow-[0_0_0_4px_var(--color-brand-soft)]"
        />
      </label>

      {estado?.error && (
        <p className="anim-in rounded-2xl bg-bad-soft px-4 py-3 text-[13px] font-semibold text-bad">
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="anim-in group mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-[15px] font-semibold text-white shadow-(--shadow-lift) transition-all hover:bg-[#d34322] active:scale-[0.99] disabled:opacity-60"
        style={{ animationDelay: "200ms" }}
      >
        {enviando ? "Entrando…" : "Entrar"}
        {!enviando && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
      </button>
    </form>
  );
}
