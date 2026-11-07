import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import SwRegister from "@/components/SwRegister";
import UpdateWatcher from "@/components/UpdateWatcher";
import "./globals.css";

// Self-hosted at build time: no request to Google Fonts before the page can paint, and the fallback is size-matched so text does not jump.
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap", variable: "--font-display" });
const body = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "Typecast", template: "%s · Typecast" },
  description: "Find out where you know the cast and crew from, track what you watch, and see where to stream it.",
  applicationName: "Typecast",
  appleWebApp: { capable: true, title: "Typecast", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#eef0f4" }, { media: "(prefers-color-scheme: dark)", color: "#0f1116" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        {/* Posters and photos all come from here; open the connection while the page is still loading. */}
        <link rel="preconnect" href="https://image.tmdb.org" />
      </head>
      <body>
        {children}
        <SwRegister />
        <UpdateWatcher />
      </body>
    </html>
  );
}
