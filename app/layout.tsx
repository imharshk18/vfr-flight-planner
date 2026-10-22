import type { Metadata } from "next";
import { JetBrains_Mono, Syne } from "next/font/google";
import "./cockpit.css";
import "./cockpit-hud.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-data",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AeroTwin · Flight Rehearsal",
  description:
    "Interactive 3D VFR corridor rehearsal with Go/No-Go decisioning for general aviation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${syne.variable} ${jetbrains.variable} h-full`}>
      <body className="h-full overflow-hidden bg-[#050709]">{children}</body>
    </html>
  );
}
