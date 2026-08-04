import { useEffect, useState, useTransition } from "react";

type Quadra<T> = [T, T, T, T];

export interface QuestionType {
  question_id: number;
  rating: number;
  title: string;
  title_slug: string;
  _hash: number;
}

export interface Contest {
  ID: number;
  StartTime: number;
  Contest: string;
  TitleSlug: string;
  A: QuestionType;
  B: QuestionType;
  C: QuestionType;
  D: QuestionType;
}

interface ContestType {
  id: number;
  start_time: number;
  title: string;
  title_slug: string;
}

type ContestsResponse = {
  company: {};
  contest: ContestType;
  questions: Quadra<QuestionType>;
}[];

function mapContests(data: ContestsResponse): Contest[] {
  return data.map(({ contest, questions }) => {
    return {
      ID: contest.id,
      StartTime: contest.start_time,
      Contest: contest.title,
      TitleSlug: contest.title_slug,
      A: questions[0],
      B: questions[1],
      C: questions[2],
      D: questions[3],
    };
  });
}

let contestsCache: Promise<Contest[]> | undefined;

export function loadContests() {
  contestsCache ??= fetch("/contest.json", { cache: "force-cache" })
    .then((res) => res.json())
    .then((result: ContestsResponse) => mapContests(result));

  return contestsCache;
}

export function useContests() {
  const [isPending, startTransition] = useTransition();
  const [contests, setContests] = useState<Contest[]>([]);

  useEffect(() => {
    let active = true;
    loadContests().then((result) => {
      if (active) {
        startTransition(() => {
          setContests(result);
        });
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { contests, isPending };
}
