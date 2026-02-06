import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Prep Tool",
  description: "Analyze your chess opponents and find their weaknesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-chess-bg text-gray-100 antialiased">
        <nav className="border-b border-chess-border bg-chess-card/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <a href="/" className="flex items-center gap-2 font-bold text-lg">
                <span className="text-2xl">&#9822;</span>
                <span>Chess Prep</span>
              </a>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
