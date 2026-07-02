import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Fotos de albaranes desde el móvil (el límite por defecto es 1 MB).
      bodySizeLimit: "8mb",
    },
  },
  async redirects() {
    // Rutas antiguas → estructura de navegación estilo Haddock.
    return [
      { source: "/precios", destination: "/productos", permanent: false },
      { source: "/facturas", destination: "/documentos", permanent: false },
    ];
  },
};

export default nextConfig;
