import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// Login "portada de carta": panel coral con la marca (leaders de puntos como
// una carta de restaurante) + formulario en crema. En móvil queda solo el
// formulario con una cabecera compacta.
const PLATOS_PORTADA = [
  { nombre: "Escandallos", detalle: "al céntimo" },
  { nombre: "Compras", detalle: "a raya" },
  { nombre: "Reservas", detalle: "con cabeza" },
  { nombre: "Food cost", detalle: "≤ 33%" },
];

export default function LoginPage() {
  return (
    <main className="flex min-h-screen">
      {/* ── Panel de marca (portada de la carta) ── */}
      <aside className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden bg-brand p-10 text-white md:flex">
        {/* C gigante de fondo, como marca al agua */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-40 font-display text-[34rem] leading-none font-extrabold text-white/10 select-none"
        >
          C
        </span>

        <div className="anim-in font-display text-lg font-bold tracking-tight">
          Can Costa
          <small className="block font-body text-[12px] font-medium text-white/70">
            food cost &amp; compras
          </small>
        </div>

        <div className="relative">
          <h1
            className="anim-in font-display text-[56px] leading-[1.02] font-extrabold tracking-tight text-balance"
            style={{ animationDelay: "60ms" }}
          >
            La cocina, con los números en su sitio.
          </h1>

          <div className="mt-10 flex max-w-sm flex-col gap-3.5">
            {PLATOS_PORTADA.map((p, i) => (
              <div
                key={p.nombre}
                className="anim-in flex items-baseline gap-2 font-display text-[15px] font-semibold"
                style={{ animationDelay: `${140 + i * 70}ms` }}
              >
                <span>{p.nombre}</span>
                <span aria-hidden className="flex-1 border-b-2 border-dotted border-white/35" />
                <span className="font-body font-medium text-white/85">{p.detalle}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="anim-in text-[12.5px] font-medium text-white/60" style={{ animationDelay: "450ms" }}>
          Barcelona · uso interno del equipo
        </p>
      </aside>

      {/* ── Formulario ── */}
      <section className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[360px]">
          {/* Cabecera compacta (móvil, donde no se ve el panel) */}
          <div className="anim-in mb-8 flex items-center gap-3 md:hidden">
            <div className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-brand font-display text-xl font-extrabold text-white">
              C
            </div>
            <div className="font-display text-xl font-bold tracking-tight">
              Can Costa
              <small className="block font-body text-[11.5px] font-medium text-ink-soft">
                food cost &amp; compras
              </small>
            </div>
          </div>

          <h2 className="anim-in font-display text-[30px] font-extrabold tracking-tight">Hola de nuevo</h2>
          <p className="anim-in mt-1 mb-7 text-[14px] text-ink-soft" style={{ animationDelay: "50ms" }}>
            Entra con tu usuario y tu contraseña.
          </p>

          <LoginForm />
        </div>
      </section>
    </main>
  );
}
