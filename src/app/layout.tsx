import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Ateliê · Agenda & atendimento",
  description: "Agenda e atendimento do salão de unhas",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
