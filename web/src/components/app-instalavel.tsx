"use client";

import { useEffect, useState } from "react";

type PromptEvento = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registra o service worker e oferece "Instalar o app" (Chrome/Edge/Android) ou o passo a passo no iPhone/iPad. Some quando já está instalado. */
export function AppInstalavel() {
  const [evento, setEvento] = useState<PromptEvento | null>(null);
  const [ios, setIos] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [instalado, setInstalado] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalado(standalone);
    const ua = navigator.userAgent;
    setIos(/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1));
    const pegar = (e: Event) => { e.preventDefault(); setEvento(e as PromptEvento); };
    const feito = () => { setInstalado(true); setEvento(null); };
    window.addEventListener("beforeinstallprompt", pegar);
    window.addEventListener("appinstalled", feito);
    return () => { window.removeEventListener("beforeinstallprompt", pegar); window.removeEventListener("appinstalled", feito); };
  }, []);

  if (instalado || (!evento && !ios)) return null;
  if (evento) return (
    <button type="button" className="btn btn-secondary btn-sm w-full" onClick={async () => { await evento.prompt(); await evento.userChoice; setEvento(null); }}>
      Instalar o app A360
    </button>
  );
  return (
    <div className="text-[0.74rem] text-[var(--txt-2)]">
      <button type="button" className="btn btn-secondary btn-sm w-full" aria-expanded={aberto} onClick={() => setAberto((x) => !x)}>Instalar o app A360</button>
      {aberto && <p className="mt-2 leading-snug">No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b>. O A360 abre como app, sem a barra do navegador.</p>}
    </div>
  );
}
