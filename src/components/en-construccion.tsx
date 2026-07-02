import { Hammer } from "lucide-react";
import { PageHead } from "@/components/ui";

export function EnConstruccion({
  titulo,
  subtitulo,
  descripcion,
}: {
  titulo: string;
  subtitulo: string;
  descripcion: string;
}) {
  return (
    <section className="anim-in">
      <PageHead titulo={titulo} subtitulo={subtitulo} />
      <div className="card flex flex-col items-center gap-3 px-8 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-brand-soft">
          <Hammer className="size-6 text-brand" />
        </div>
        <h3 className="font-display text-lg font-bold tracking-tight">En construcción</h3>
        <p className="max-w-md text-[14px] leading-relaxed text-ink-soft">{descripcion}</p>
      </div>
    </section>
  );
}
