import type { Metadata } from "next";
import { Syne, Space_Mono, Archivo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Three faces, three jobs. The personal site runs Syne + Space Mono only, but
// it is a one-page CV — this is a 500-row data tool, and prose set in a
// monospace face is genuinely slow to read at 15px. So Space Mono keeps the
// work it is good at (headlines, labels, chips, figures) and Archivo, a narrow
// grotesque, carries anything you actually have to read a sentence of.
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

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html
      lang="en"
      className={`${syne.variable} ${spaceMono.variable} ${archivo.variable}`}
    >
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
          {/* A full sentence, so it is set as one — not as a tracked-out label. */}
          <span className="text-[0.8rem] text-meta">
            Ledion Brati · Presence gap 60% / fit 40% · Messages always sent by
            hand
          </span>
        </footer>
      </body>
    </html>
  );
}
