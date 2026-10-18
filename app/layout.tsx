import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TryOn Compare · Fitting room",
  description: "Compare clothing with a visual try-on, prices and your own notes.",
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
