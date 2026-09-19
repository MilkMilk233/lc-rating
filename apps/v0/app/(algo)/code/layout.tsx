import DocumentLanguage from "@components/layouts/DocumentLanguage";
import MdxLayout from "@components/layouts/MdxLayout";
import Dijkstra from "@components/sections/dijkstra.mdx";
import MonotoneStack from "@components/sections/mono.mdx";
import SegmentTree from "@components/sections/segment_tree.mdx";
import SparseTable from "@components/sections/sparestable.mdx";
import String from "@components/sections/string.mdx";
import type { MessageKey } from "@hooks/useI18n";
import "@scss/algorithm/styles.scss";

import type { Metadata } from "next";

export interface Route {
  path: string;
  /** Resolved through the message dictionary, like every other label. */
  displayKey: MessageKey;
  mdx: React.ReactNode;
}

const routes: Route[] = [
  {
    path: "/algorithm-templates#String",
    displayKey: "algo.string",
    mdx: <String />,
  },
  {
    path: "/algorithm-templates#Monotone-Stack",
    displayKey: "algo.monotoneStack",
    mdx: <MonotoneStack />,
  },
  {
    path: "/algorithm-templates#Dijkstra",
    displayKey: "algo.dijkstra",
    mdx: <Dijkstra />,
  },
  {
    path: "/algorithm-templates#SparseTable",
    displayKey: "algo.sparseTable",
    mdx: <SparseTable />,
  },
  {
    path: "/algorithm-templates#SegmentTree",
    displayKey: "algo.segmentTree",
    mdx: <SegmentTree />,
  },
];

export const metadata: Metadata = {
  title: "My Code Templates",
  icons: "/favico.svg",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The static export always ships Chinese first; DocumentLanguage corrects
  // `lang` on the client once the stored locale is known, exactly as the (lc)
  // layout does for the rest of the site.
  return (
    <html lang="zh">
      <body>
        <DocumentLanguage />
        <MdxLayout routes={routes}>{children}</MdxLayout>
      </body>
    </html>
  );
}
