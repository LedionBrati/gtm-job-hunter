import type { Metadata } from "next";
import { Syne, Space_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Same pairing as ledionbrati.com: Syne for display weight, Space Mono
// for everything else (including headlines — the site's signature move).
const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Targets — GTM",
  description:
    "YC startups ranked by social-presence gap. Which founders to message today.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${syne.variable} ${spaceMono.variable}`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-50 flex items-center justify-between border-b border-hair bg-[rgba(10,10,10,0.88)] px-6 py-4 backdrop-blur-xl">
          <Link
            href="/"
            className="font-display text-[0.8rem] font-bold uppercase tracking-[0.12em] text-text no-underline"
          >
            Targets<span className="text-accent">.</span>
          </Link>
          <nav className="flex items-center gap-7">
            <Link href="/" className="label-muted underline-grow no-underline">
              Ranked
            </Link>
            <Link
              href="/companies/new"
              className="label-muted underline-grow no-underline"
            >
              Add
            </Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="mt-20 border-t border-hair px-6 py-6">
          <span className="label-muted">
            Ledion Brati · Presence gap 60% / fit 40% · Messages always sent by
            hand
          </span>
        </footer>
      </body>
    </html>
  );
}
