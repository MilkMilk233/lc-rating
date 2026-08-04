"use client";

import ContestList from "@components/containers/ContestList";

// function delay(fn: Promise<any>, timeout: number) {
//   return new Promise<any>((resolve) => {
//     setTimeout(async () => {
//       resolve(await fn);
//     }, timeout);
//   });
// }

export default function Page() {
  return <ContestList />;
}
