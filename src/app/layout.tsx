import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PwaManager } from "@/components/pwa-manager";

export const metadata: Metadata = {
  title: { default: "DCC Portal", template: "%s | DCC Portal" },
  description: "College management portal of Damdei Christian College",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "DCC Portal", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#16324f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}<PwaManager /></Providers></body>
    </html>
  );
}
