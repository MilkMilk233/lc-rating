import { useEffect, useState, useTransition } from "react";

type SolutionsResponse = Record<
  string,
  [string, string, string, `${number}`, string, string, number]
>;

export interface SolutionType {
  questTitle: string;
  questSlug: string;
  questId: string;
  solnTitle: string;
  solnSlug: string;
  solnTime: string;
  _hash: number;
}

export type Solutions = Record<string, SolutionType>;

let solutionsCache: Promise<Solutions> | undefined;

function loadSolutions() {
  solutionsCache ??= fetch("/solutions.json", { cache: "force-cache" })
    .then((res) => res.json())
    .then((result: SolutionsResponse) => {
      let solutions: Solutions = {};
      for (let key in result) {
        const [
          solnTitle,
          solnSlug,
          solnTime,
          questId,
          questTitle,
          questSlug,
          _hash,
        ] = result[key];

        solutions[key] = {
          questTitle,
          questSlug,
          questId,
          solnTitle,
          solnSlug,
          solnTime,
          _hash,
        };
      }
      return solutions;
    });

  return solutionsCache;
}

export function useSolutions() {
  // solutions
  const [isPending, startTransition] = useTransition();
  const [solutions, setSolutions] = useState<Solutions>({});

  useEffect(() => {
    let active = true;
    loadSolutions().then((result) => {
      if (active) {
        startTransition(() => {
          setSolutions(result);
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { solutions, isPending };
}
