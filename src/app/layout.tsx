import type { Metadata } from "next";
import "./globals.css";
import AuthSessionProvider from "@/components/session-provider";

export const metadata: Metadata = {
  title: "LiveStream — Diffusion en direct",
  description: "Plateforme de streaming vidéo en direct avec latence sub-100ms",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Display:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
