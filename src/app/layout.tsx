import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Redline | Professional Critique. Zero Ego.",
  description: "AI-augmented art director and mentor for digital artists.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased overflow-hidden h-screen w-screen bg-zinc-950 text-zinc-50">
        {children}
      </body>
    </html>
  );
}
