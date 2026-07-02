import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "good" | "warn" | "bad" | "gray";

const TONOS: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  gray: "bg-chip text-ink-soft",
};

export function Chip({
  tone,
  dot,
  pulse,
  className,
  children,
}: {
  tone: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONOS[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full bg-current", pulse && "animate-pulse")} />}
      {children}
    </span>
  );
}

export function PageHead({
  titulo,
  subtitulo,
  derecha,
}: {
  titulo: React.ReactNode;
  subtitulo?: string;
  derecha?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[27px] font-bold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-ink-soft">{subtitulo}</p>}
      </div>
      {derecha}
    </div>
  );
}

export function MonthChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="card flex items-center gap-2 rounded-full! px-4 py-2 text-[13.5px] font-semibold">
      <Calendar className="size-4 text-ink-soft" />
      {children}
    </div>
  );
}
