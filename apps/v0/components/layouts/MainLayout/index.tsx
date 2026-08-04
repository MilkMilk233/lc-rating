"use client";

import Navbar from "@components/layouts/Navbar";
import Loading from "@components/Loading";
import { ThemeProvider } from "@hooks/useTheme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";

import "@scss/styles.scss";

const client = new QueryClient();

export default function ({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <div className="app bg-body">
          <Navbar />
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </div>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
