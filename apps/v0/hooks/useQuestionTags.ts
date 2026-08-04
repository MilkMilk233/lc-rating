import { useSuspenseQuery } from "@tanstack/react-query";

export type QTag = [string[], string[]];
export type QTags = Record<string, QTag>;

export function useQuestionTags(filter: any) {
  const { data, isFetching } = useSuspenseQuery({
    queryKey: ["qtags"],
    queryFn: () => {
      return fetch("/qtags.json", { cache: "force-cache" })
        .then((res) => res.json())
        .then((result: QTags) => {
          return result;
        });
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return { tags: data, isPending: isFetching };
}
