import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wyoming AI Judge",
  description:
    "AI-powered small claims court simulation for educational purposes",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-wy-cream dark:bg-zinc-950">
          <header className="sticky top-0 z-40 border-b border-wy-navy-dark bg-wy-navy/[.97] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:h-16 sm:px-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-wy-gold text-sm font-extrabold text-wy-navy shadow-sm sm:h-10 sm:w-10 sm:text-base">
                  WJ
                </div>
                <span className="text-base font-semibold text-white sm:text-lg">
                  Wyoming AI Judge
                </span>
              </div>
              <span className="rounded-full border border-wy-gold/30 bg-wy-gold/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-wy-gold sm:px-3 sm:py-1 sm:text-xs">
                Educational
                <span className="hidden sm:inline"> Simulation</span>
              </span>
            </div>
          </header>
          <main>
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </body>
    </html>
  );
}
