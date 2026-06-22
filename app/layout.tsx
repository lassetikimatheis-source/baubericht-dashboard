import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PARIBUS Baukosten Analyse",
  description: "Dashboard-Prototyp für Dokumenten-Upload und Baukostenanalyse"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
