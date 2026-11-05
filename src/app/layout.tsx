import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/shell/AppShell";
import { GameModalProvider } from "@/components/games/GameModal";
import { TelegramBridge } from "@/components/shell/TelegramBridge";
import { PrefsProvider } from "@/components/shell/PrefsProvider";
import { ErrorReporter } from "@/components/shell/ErrorReporter";

const geist = Geist({ subsets: ["latin", "cyrillic"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-geist-mono", display: "swap" });
const unbounded = Unbounded({ subsets: ["latin", "cyrillic"], variable: "--font-unbounded", weight: ["500", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Verdant — мини-игры на демо-кредитах", template: "%s · Verdant" },
  description: "Игровая демо-платформа: слоты, Crash, Mines, Plinko и другие игры на виртуальных демо-кредитах.",
};
export const viewport: Viewport = { themeColor: "#070b1f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${geist.variable} ${geistMono.variable} ${unbounded.variable}`}>
      <body className="min-h-dvh">
        <AuthProvider>
          <TelegramBridge />
          <ErrorReporter />
          <PrefsProvider><GameModalProvider><AppShell>{children}</AppShell></GameModalProvider></PrefsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
