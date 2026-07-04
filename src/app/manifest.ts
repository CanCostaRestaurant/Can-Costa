import type { MetadataRoute } from "next";

// PWA: instalada en la tablet ("Añadir a pantalla de inicio") se abre a
// pantalla completa directamente en el TPV, como una app nativa de cobro.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Can Costa TPV",
    short_name: "Can Costa",
    description: "TPV y ventas de Can Costa",
    start_url: "/tpv",
    display: "standalone",
    orientation: "landscape",
    background_color: "#F7F3EC",
    theme_color: "#F7F3EC",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
