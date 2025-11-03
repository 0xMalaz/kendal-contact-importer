import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { SidebarNav } from "@/components/sidebar-nav";
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
  title: "Kendal Dashboard",
  description: "Simple contact management dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <div className="flex min-h-screen flex-col bg-muted/20">
          <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <div className="mx-auto flex h-16 w-full  items-center justify-between px-6">
              <Link
                href="/"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                Kendal.ai
              </Link>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
             
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
                  KM
                </span>
              </div>
            </div>
          </header>
          <div className="flex flex-1">
            <aside className="hidden w-64 flex-col border-r bg-background/80 px-6 py-8 md:flex">
              <SidebarNav />
            </aside>
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-6xl px-6 py-8">
                {children}
              </div>
            </main>
          </div>
          <Toaster position="bottom-right" toastOptions={{ duration: 4000 }} />
        </div>
      </body>
    </html>
  );
}
