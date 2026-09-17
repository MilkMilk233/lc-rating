"use client";

import FixedSidebar from "@components/FixedSidebar";
import MoveToTopButton from "@components/MoveToTopButton";
import ProblemCategory from "@components/ProblemCatetory";
import {
  TableOfContent,
  TOC,
} from "@components/ProblemCatetory/TableOfContent";
import { useI18n } from "@hooks/useI18n";
import type { FixedItem } from "@components/FixedSidebar";
import useStorage from "@hooks/useStorage";
import { hashCode } from "@utils/hash";
import { translateLeetCodeUrl } from "@utils/leetcodeLinks";
import { useEffect } from "react";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/esm/Form";
import MoveToTodoButton from "./MoveToTodoButton";

const mapCategory2TOC = (
  { title, leafChild, nonLeafChild }: ProblemCategory,
  level: number,
): TOC => {
  let toc = {
    id: `#${hashCode(title)}`,
    title: title,
    level: level,
    count: 0,
  } as TOC;
  toc.count = leafChild?.length || 0;
  toc.children = nonLeafChild.map((c) => {
    if (c) return mapCategory2TOC(c, level + 1);
    return null;
  });
  toc.children.forEach((t) => {
    toc.count += t.count;
  });
  return toc;
};

export default function ({ data }: { data: ProblemCategory }) {
  const { language, t } = useI18n();

  const scrollToComponent = () => {
    if (window.location.hash) {
      let id = window.location.hash.replace("#", "");
      const ele = document.getElementById(id);
      if (ele) {
        ele.scrollIntoView({ behavior: "instant" });
        ele.focus();
      }
    }
  };

  useEffect(() => scrollToComponent(), []);

  const settingDefault = {
    showEn: true,
    showRating: true,
    showPremium: true,
  };

  const [setting = settingDefault, setSetting] = useStorage(
    "lc-rating-list-settings",
    {
      defaultValue: settingDefault,
    },
  );

  const buttons: FixedItem[] = [
    {
      id: "move-to-top",
      content: <MoveToTopButton />,
    },
    {
      id: "move-to-todo",
      content: <MoveToTodoButton />,
      tooltipKey: "list.next",
    },
    {
      id: "move-to-random-todo",
      content: <MoveToTodoButton random />,
      tooltipKey: "list.random",
    },
  ];

  return (
    <Container fluid className="problem-list page-shell order-1">
      <FixedSidebar
        gap={3}
        initialOffset={{ x: "2rem", y: "2rem" }}
        items={buttons}
        position="bottom"
      />
      <header className="page-heading topic-heading">
        <div>
          <p className="eyebrow">Study plan</p>
          <h1 className="page-title">{data.title}</h1>
          <p className="page-description">
            {t("list.frozen")}
          </p>
        </div>
        <div className="metric-strip">
          <span className="metric-pill">
            Updated <strong>{data["last_update"]}</strong>
          </span>
        </div>
      </header>
      <section className="toolbar-panel topic-toolbar">
        <div className="toolbar-group">
          <Form.Check
            checked={setting.showEn}
            onChange={() => {
              setSetting({ ...setting, showEn: !setting.showEn });
            }}
            type="switch"
            label={t("list.englishLink")}
          />
          <Form.Check
            checked={setting.showRating}
            onChange={() => {
              setSetting({ ...setting, showRating: !setting.showRating });
            }}
            type="switch"
            label={t("list.rating")}
          />
          <Form.Check
            checked={setting.showPremium}
            onChange={() => {
              setSetting({ ...setting, showPremium: !setting.showPremium });
            }}
            type="switch"
            label={t("list.premium")}
          />
        </div>
        <a
          target="_blank"
          className="source-link"
          href={translateLeetCodeUrl(data.original_src, language)}
        >
          {t("list.original")}
        </a>
      </section>
      <div className="topic-layout">
        <aside className="toc data-panel" id="toc">
          <TableOfContent toc={mapCategory2TOC(data, 0)} />
        </aside>
        <div className="pb-content" data-bs-spy="scroll" data-bs-target="#toc">
          <ProblemCategory
            data={[data]}
            showEn={setting.showEn}
            showRating={setting.showRating}
            showPremium={setting.showPremium}
            summary={""}
          />
        </div>
      </div>
    </Container>
  );
}
