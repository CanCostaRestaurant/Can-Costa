"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { guardarFotoPlato } from "../actions";

// Comprime la foto en el navegador antes de subirla: la encajamos en un cuadrado
// de LADO px (recorte centrado) y la exportamos como JPEG. Así la data URL que
// guardamos ronda las decenas de KB en vez de varios MB de la foto original.
const LADO = 640;
const CALIDAD = 0.72;

function comprimir(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lado = Math.min(img.width, img.height);
      const sx = (img.width - lado) / 2;
      const sy = (img.height - lado) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = LADO;
      canvas.height = LADO;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No se pudo procesar la imagen"));
      ctx.drawImage(img, sx, sy, lado, lado, 0, 0, LADO, LADO);
      resolve(canvas.toDataURL("image/jpeg", CALIDAD));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

export function FotoPlato({
  platoId,
  fotoUrl,
  emoji,
  onEmojiChange,
  onEmojiBlur,
}: {
  platoId: string;
  fotoUrl: string | null;
  emoji: string;
  onEmojiChange: (v: string) => void;
  onEmojiBlur: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ocupado, startAccion] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    if (!archivo.type.startsWith("image/")) {
      setError("Elige un archivo de imagen");
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await comprimir(archivo);
    } catch {
      setError("No se pudo procesar la imagen");
      return;
    }
    startAccion(async () => {
      const res = await guardarFotoPlato(platoId, dataUrl);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar la foto");
        return;
      }
      router.refresh();
    });
  }

  function quitar() {
    setError(null);
    startAccion(async () => {
      const res = await guardarFotoPlato(platoId, null);
      if (!res.ok) {
        setError(res.error ?? "No se pudo quitar la foto");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          elegir(e.target.files?.[0]);
          e.target.value = ""; // permite re-elegir la misma foto
        }}
      />

      <div className="group relative size-[76px] shrink-0">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={ocupado}
          className={cn(
            "size-full overflow-hidden rounded-2xl border border-line transition-colors",
            fotoUrl ? "cursor-pointer" : "flex items-center justify-center bg-card hover:border-brand",
          )}
          aria-label={fotoUrl ? "Cambiar foto del plato" : "Añadir foto del plato"}
        >
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoUrl} alt="Foto del plato" className="size-full object-cover" />
          ) : (
            <input
              value={emoji}
              onChange={(e) => onEmojiChange(e.target.value)}
              onBlur={onEmojiBlur}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent text-center text-[30px] outline-none"
              aria-label="Emoji del plato"
            />
          )}

          {/* Velo con la cámara al pasar por encima (solo cuando hay foto) */}
          {fotoUrl && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/45 group-hover:opacity-100">
              {ocupado ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            </span>
          )}
          {!fotoUrl && ocupado && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
              <Loader2 className="size-5 animate-spin" />
            </span>
          )}
        </button>

        {/* Botón flotante para quitar la foto */}
        {fotoUrl && !ocupado && (
          <button
            type="button"
            onClick={quitar}
            className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-line bg-card text-ink-soft shadow-sm transition-colors hover:border-bad hover:text-bad"
            aria-label="Quitar foto"
            title="Quitar foto"
          >
            <ImageOff className="size-3.5" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado}
        className="text-[11px] font-semibold text-ink-soft transition-colors hover:text-brand disabled:opacity-50"
      >
        {fotoUrl ? "Cambiar foto" : "Añadir foto"}
      </button>

      {error && <span className="max-w-[92px] text-center text-[10.5px] leading-tight text-bad">{error}</span>}
    </div>
  );
}
