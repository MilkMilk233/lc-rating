import type { Metadata } from "next";
import MainLayout from "@components/layouts/MainLayout";

export const metadata: Metadata = {
  title: "LC-Rating & Training",
  icons: "/favico.svg",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <head>
        <link rel="dns-prefetch" href="https://leetcode.cn" />
        <link rel="dns-prefetch" href="https://leetcode.com" />
        <link rel="preconnect" href="https://leetcode.cn" />
        <link rel="preconnect" href="https://leetcode.com" />
      </head>
      <body>
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
