import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeedWatch AI — Crop Health for the 21st Century",
  description:
    "WeedWatch AI uses satellite imagery and machine learning to tell farmers exactly where weeds are and exactly when to act — reducing costs, chemical use, and environmental harm.",
  openGraph: {
    title: "WeedWatch AI",
    description: "Precision herbicide. Planet-scale.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${GeistSans.className} grain-overlay`}>
        {children}
      </body>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-EEB81Y10SQ"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-EEB81Y10SQ');
        `}
      </Script>
    </html>
  );
}
