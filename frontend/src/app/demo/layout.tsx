import { Literata, Nunito_Sans } from "next/font/google";

const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-demo-sans",
});

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-demo-serif",
});

/** Demo-only type. The rest of the app keeps its own fonts. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${nunito.variable} ${literata.variable} [font-family:var(--font-demo-sans)]`}>
      {children}
    </div>
  );
}
