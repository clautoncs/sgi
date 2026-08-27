import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";
import "./login.css";

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
      <head>
        {/* Aplica o tema salvo antes da primeira pintura pra não piscar */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("sgi-theme");if(t==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
