import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Le Kyoto · Brigade",
  description: "Your kitchen brigade's daily call: what to prep, why, and ask the Chef back.",
};

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${serif.variable}`}>{children}</div>;
}
