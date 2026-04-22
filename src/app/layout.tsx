import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
