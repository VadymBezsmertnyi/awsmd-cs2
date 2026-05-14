import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { FC, ReactNode } from "react";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Аналізатор CS2 demo",
  description: "Локальний парсинг CS2 demo та тактичний звіт",
};

type RootLayoutPropsI = {
  children: ReactNode;
};

const rootLayout: FC<RootLayoutPropsI> = ({ children }) => (
  <html
    lang="uk"
    className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
  >
    <body className="flex min-h-full flex-col">{children}</body>
  </html>
);

export default rootLayout;
