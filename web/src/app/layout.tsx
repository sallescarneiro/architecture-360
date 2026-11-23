import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "rucelle — Architecture 360",
  description: "Gestão e inteligência da equipe de arquitetura da Rucelle (uso interno)",
  applicationName: "A360",
  appleWebApp: { capable: true, title: "A360", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon.ico" }, { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#5b0d0d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
