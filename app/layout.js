import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata = {
  title: "Blinders.ai",
  description: "Analyze and forecast video performance for social media powered by Blinders.ai.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="">
        {children}
      </body>
    </html>
  );
}
