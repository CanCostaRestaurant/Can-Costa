import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const sans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Can Costa · Food cost y compras",
  description: "Gestión de compras, precios y escandallos de Can Costa",
  // Instalable en la tablet como app (iPad usa estas etiquetas, no el manifest).
  appleWebApp: {
    capable: true,
    title: "Can Costa TPV",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#F7F3EC",
  width: "device-width",
  initialScale: 1,
  // En la tablet de sala no queremos zoom accidental con los dedos al cobrar.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink font-body">{children}</body>
    </html>
  );
}
