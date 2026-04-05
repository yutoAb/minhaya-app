import type { Metadata } from "next";
import "./globals.css";
import AuthInit from "./AuthInit";

export const metadata: Metadata = {
  title: "PoliQuiz - 政治クイズバトル",
  description: "みんなで楽しむ政治クイズ対戦アプリ。1人で練習も、最大10人で対戦も。",
  openGraph: {
    title: "PoliQuiz - 政治クイズバトル",
    description: "みんなで楽しむ政治クイズ対戦アプリ。1人で練習も、最大10人で対戦も。",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PoliQuiz - 政治クイズバトル",
    description: "みんなで楽しむ政治クイズ対戦アプリ。1人で練習も、最大10人で対戦も。",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthInit />
        {children}
      </body>
    </html>
  );
}
