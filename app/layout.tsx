import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "少儿英语·家庭版",
  description: "面向家庭的少儿英语词汇学习工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
