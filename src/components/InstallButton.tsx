"use client";
import { useEffect, useState } from "react";

interface Evt extends Event { prompt: () => Promise<void> }

export default function InstallButton() {
  const [evt, setEvt] = useState<Evt | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as Evt); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (evt) return <button className="btn gold" onClick={() => { evt.prompt(); setEvt(null); }}>Install Typecast</button>;
  return <>iPhone: Share, then Add to Home Screen. Android: browser menu, then Install app. Desktop: install icon in the address bar.</>;
}
