import type { Metadata } from "next";
import { Newsreader, Outfit } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({ 
  subsets: ["latin"], 
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-newsreader" 
});

const outfit = Outfit({ 
  subsets: ["latin"], 
  display: "swap",
  variable: "--font-outfit" 
});

export const metadata: Metadata = {
  title: "Redline | Art Direction",
  description: "Digital art direction and mentorship system.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${newsreader.variable} font-sans antialiased overflow-hidden h-screen w-screen bg-[#fcfcfc] text-zinc-800`}>
        {children}
      </body>
    </html>
  );
}
