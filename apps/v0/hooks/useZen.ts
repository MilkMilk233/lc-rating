"use client";

import { useQuery } from "@tanstack/react-query";

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

let zenCache: Promise<ConstQuestion[]> | undefined;

export function loadZen() {
  zenCache ??= fetch("/zenk.json", { cache: "force-cache" })
    .then((res) => res.json())
    .then((result: ConstQuestion[]) => {
      return result;
    });

  return zenCache;
}

export function useZen() {
  const { data = [], isFetching } = useQuery({
    queryKey: ["zen"],
    queryFn: loadZen,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return { zen: data, isPending: isFetching };
}
