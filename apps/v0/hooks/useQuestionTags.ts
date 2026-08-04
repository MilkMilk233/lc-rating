import { useQuery } from "@tanstack/react-query";

export type QTag = [string[], string[]];
export type QTags = Record<string, QTag>;

let questionTagsCache: Promise<QTags> | undefined;

export function loadQuestionTags() {
  questionTagsCache ??= fetch("/qtags.json", { cache: "force-cache" })
    .then((res) => res.json())
    .then((result: QTags) => {
      return result;
    });

  return questionTagsCache;
}

export function useQuestionTags(filter: any) {
  const { data = {}, isFetching } = useQuery({
    queryKey: ["qtags"],
    queryFn: loadQuestionTags,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return { tags: data, isPending: isFetching };
}
