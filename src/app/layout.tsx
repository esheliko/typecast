import type { Metadata, Viewport } from "next";
import SwRegister from "@/components/SwRegister";
import UpdateWatcher from "@/components/UpdateWatcher";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Typecast", template: "%s · Typecast" },
  description: "Find out where you know actors from, track what you watch, and see where to stream it.",
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap" />
      </head>
      <body>
        {children}
        <SwRegister />
        <UpdateWatcher />
      </body>
    </html>
  );
}
