import "./globals.css";

export const metadata = {
  title: "QueimaFácil — Gestão de Torneios",
  description: "Gestão completa de torneios de queimada"
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
