import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card anim-in w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-3">
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
        <LoginForm />
      </div>
    </main>
  );
}
