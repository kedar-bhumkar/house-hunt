import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "House Hunt",
  description: "A live decision dashboard for Eden Prairie homes through $650,000.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
