import type { MetadataRoute } from "next";

/** A360 instalável (PWA): ícone na tela inicial e janela própria, sem a barra do navegador. Login e dados não mudam. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "rucelle · Architecture 360",
    short_name: "A360",
    description: "Gestão e inteligência da equipe de arquitetura da rucelle (uso interno).",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#5b0d0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
