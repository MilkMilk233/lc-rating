"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

// Question Data Type
interface ConstQuestion {
  cont_title: string;
  cont_title_slug: string;
  title: string;
  title_slug: string;
  question_id: string;
  paid_only: boolean;
  rating: number;
  _hash: number;
}

export function useZen() {
  const { data, isFetching } = useSuspenseQuery({
    queryKey: ["zen"],
    queryFn: () =>
      fetch("/zenk.json", { cache: "force-cache" })
        .then((res) => res.json())
        .then((result: ConstQuestion[]) => {
          return result;
        }),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return { zen: data, isPending: isFetching };
}
