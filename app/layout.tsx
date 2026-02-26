import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "FinanceOS",
  description: "Personal finance dashboard",
  // Apple PWA meta tags — auto-injects apple-mobile-web-app-* headers
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FinanceOS",
  },
};

// Separate viewport export required by Next.js App Router
export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover", // allows content to extend under iPhone notch/Dynamic Island
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="antialiased h-full">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
