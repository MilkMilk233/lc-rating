"use client";

import data from "@components/containers/List/data/trees";
import dynamic from "next/dynamic";

const List = dynamic(() => import("@components/containers/List"), {
  ssr: false,
});

export default function Page() {
  return <List data={data} />;
}
