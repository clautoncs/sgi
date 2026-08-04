import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";
import "./login/login.css";

export const metadata: Metadata = {
  title: "SGI — Sistema de Gerenciamento iLinked",
  description: "Plataforma de dashboards com autenticação e integrações configuráveis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
