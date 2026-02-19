import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minhaya 1v1",
  description: "Political quiz 1v1 MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
