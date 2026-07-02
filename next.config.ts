import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Rutas antiguas → estructura de navegación estilo Haddock.
    return [
      { source: "/precios", destination: "/productos", permanent: false },
      { source: "/facturas", destination: "/documentos", permanent: false },
    ];
  },
};

export default nextConfig;
