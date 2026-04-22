import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "TempuraTune",
  description: "AIが油の温度を音で判定する、天ぷら職人のためのアプリ",
  icons: {
    icon: [
      { url: "/icons/favicon.png", type: "image/png" },
      { url: "/icons/app-icon.png", type: "image/png" },
    ],
    shortcut: "/icons/favicon.png",
    apple: "/icons/app-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`h-full antialiased ${manrope.variable}`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-manrope)]">{children}</body>
    </html>
  );
}
