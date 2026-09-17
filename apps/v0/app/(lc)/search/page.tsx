"use client";

import Search from "@components/containers/Search";
import { Suspense } from "react";

// `Search` reads ?q= through useSearchParams, which bails out of the static
// prerender unless it sits behind a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Search />
    </Suspense>
  );
}
