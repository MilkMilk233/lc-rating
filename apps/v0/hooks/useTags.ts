import { useEffect, useState, useTransition } from "react";

export type Tag = [number, string, string];
export type Tags = Tag[];

let tagsCache: Promise<Tags> | undefined;

export function loadTags() {
  tagsCache ??= fetch("/tags.json", { cache: "force-cache" })
    .then((res) => res.json())
    .then((result: Tags) =>
      [...result].sort(function (t1, t2) {
        return t1[2].localeCompare(t2[2]);
      }),
    );

  return tagsCache;
}

export function useTags() {
  // tags
  const [isPending, startTransition] = useTransition();
  const [tags, setTags] = useState<Tags>([]);

  useEffect(() => {
    let active = true;
    loadTags().then((result) => {
      if (active) {
        startTransition(() => {
          setTags(result);
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { tags, isPending };
}
