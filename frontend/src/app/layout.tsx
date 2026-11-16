import type { Metadata, Viewport } from "next";
import { Geist_Mono, Literata, Nunito_Sans } from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const appSans = Nunito_Sans({
  variable: "--font-app-sans",
  subsets: ["latin"],
});

const appSerif = Literata({
  variable: "--font-app-serif",
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
        className={`${appSans.variable} ${appSerif.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-wy-cream dark:bg-[#0c1728]">
          <header className="sticky top-0 z-40 bg-wy-navy">
            <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:h-16 sm:px-6">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="flex h-9 w-9 items-center justify-center bg-wy-gold text-wy-navy sm:h-10 sm:w-10">
                  <BuckingHorse />
                </div>
                <div className="leading-none">
                  <p className="font-serif text-base font-medium tracking-tight text-white sm:text-lg">
                    Wyoming
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-wy-gold">
                    Small claims
                  </p>
                </div>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 sm:text-xs">
                Educational
                <span className="hidden sm:inline"> simulation</span>
              </p>
            </div>
            <div className="h-0.5 bg-wy-gold" />
            <div className="h-px bg-wy-red" />
          </header>
          <main>
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>
      </body>
    </html>
  );
}

function BuckingHorse() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="h-6 w-6 sm:h-7 sm:w-7"
      fill="currentColor"
    >
      <path d="M7 22.5c1.2-2.4 2.2-3.4 4.2-4.2 1.2-.5 1.6-1.4 1.3-2.6-.4-1.6-1.8-2.2-3.2-1.6-.6.3-1.3.2-1.8-.3L6.2 12l2.4-1.2c.8-.4 1.2-1.2 1-2.1L9.2 7h2.4l.8 1.6c.4.8 1.2 1.3 2.1 1.3h2.2c1.4 0 2.4 1.4 1.9 2.7l-.6 1.6c-.3.8.1 1.6.8 2l2.2 1.1c1.6.8 2.4 2.6 1.9 4.3l-.7 2.2h-2.3l.5-1.6c.2-.7-.1-1.4-.7-1.7l-2.4-1.1-1.1 3.2c-.4 1.1-1.4 1.8-2.6 1.8H9.4l-.8 2.2H6.2L7 22.5z" />
    </svg>
  );
}
