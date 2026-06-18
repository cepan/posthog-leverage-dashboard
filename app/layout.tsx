import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PostHog Engineering Leverage — Top 5",
  description:
    "Who created the most leverage in the PostHog repo over the last 90 days. A ranked attention-router for engineering leaders, backed by real PRs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
