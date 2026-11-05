import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "rucelle — Architecture 360",
  description: "Gestão e inteligência da equipe de arquitetura da Rucelle (uso interno)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
