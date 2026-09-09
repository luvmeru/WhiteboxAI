import type { Metadata } from "next";
import DemoScreenRecorder from "@/components/DemoScreenRecorder";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhiteBox AI — Explainable AI Hiring OS",
  description: "Not a faster black box — a white one you can see into.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-void text-hi antialiased">
        {children}
        <DemoScreenRecorder />
      </body>
    </html>
  );
}
