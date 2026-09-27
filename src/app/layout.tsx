import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecruitFlow | Student-Recruiter Platform",
  description: "A premium connected student and recruiter hiring platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
