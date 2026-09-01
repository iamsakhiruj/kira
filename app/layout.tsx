import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Self-hosted Inter, weights 400 and 600 only (see the Design system section
// in CLAUDE.md). Exposed as --font-inter, which the font stack in globals.css
// falls through to on non-Apple devices.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Hotel Bintang KL — Accounts",
  description: "Internal accounts system for Hotel Bintang KL.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
