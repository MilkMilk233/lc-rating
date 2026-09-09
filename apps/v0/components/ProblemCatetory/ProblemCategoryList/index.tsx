"use client";

import { ShareIcon } from "@components/icons";
import ProgressRecordPanel from "@components/ProgressRecordPanel";
import RatingCircle, { ColorRating } from "@components/RatingCircle";
import { useLeetCodeLanguage } from "@hooks/useLeetCodeLanguage";
import { useProgressStore } from "@hooks/useProgressStore";
import { attemptLabel } from "@hooks/useProgressStore/bands";
import { hashCode } from "@utils/hash";
import { leetCodeProblemUrl, translateLeetCodeHtml } from "@utils/leetcodeLinks";
import { useState } from "react";

const getCols = (l: number) => {
  if (l < 12) {
    return "";
  }
  if (l < 20) {
    return "col2";
  }
  return "col3";
};

const title2id = (title: string) => {
  // title: number. title
  return title.split(". ")[0];
};

interface ProblemCategory {
  title: string;
  summary?: string;
  src?: string;
  original_src?: string;
  sort?: Number;
  isLeaf?: boolean;
  solution?: string | null;
  score?: Number | null;
  leafChild?: ProblemCategory[];
  nonLeafChild?: ProblemCategory[];
  isPremium?: boolean;
  last_update?: string;
}

interface ProblemCategoryListProps {
  data: ProblemCategory;
  showEn?: boolean;
  showRating?: boolean;
  showPremium?: boolean;
}

function ProblemCategoryList({
  data,
  showEn,
  showRating,
  showPremium,
}: ProblemCategoryListProps) {
  const { language } = useLeetCodeLanguage();
  const { derived } = useProgressStore();
  const [openId, setOpenId] = useState<string | null>(null);

  const filteredChild = (data.leafChild || []).filter(
    (item) => !item.isPremium || showPremium,
  );

  return (
    <div className="shadow rounded p-2 leaf">
      <h3 className="title" id={`${hashCode(data.title || "")}`}>
        {data.title}
      </h3>
      {data.summary && (
        <p
          className="p-2 rounded summary bg-secondary-subtle text-warning-emphasis"
          dangerouslySetInnerHTML={{
            __html: translateLeetCodeHtml(data.summary, language),
          }}
        ></p>
      )}
      <ul className={`list p-2 ${getCols(filteredChild.length)}`}>
        {filteredChild &&
          filteredChild.map((item) => {
            const id = title2id(item.title);
            const current = derived.currentByQid.get(id);
            const rating = Number(item.score);
            const open = openId === id;

            return (
              <li
                data-todo={!current}
                className="pc-item"
                key={hashCode(item.title || "")}
              >
                <div className="d-flex justify-content-between">
                  <div>
                    <a
                      href={leetCodeProblemUrl(
                        (item.src || "").replaceAll("/", ""),
                        language,
                      )}
                      target="_blank"
                    >
                      {item.title + (item.isPremium ? " (会员题)" : "")}
                    </a>
                    {showEn && (
                      <a
                        className="ms-2"
                        href={leetCodeProblemUrl(
                          (item.src || "").replaceAll("/", ""),
                          language === "cn" ? "en" : "cn",
                        )}
                        target="_blank"
                      >
                        <ShareIcon height={16} width={16} />
                      </a>
                    )}
                  </div>
                  {item.score && showRating ? (
                    <div className="ms-2 text-nowrap d-flex justify-content-center align-items-center pb-rating-bg">
                      <RatingCircle rating={rating} />
                      <ColorRating className="rating-text" rating={rating}>
                        {rating.toFixed(0)}
                      </ColorRating>
                    </div>
                  ) : null}
                  <div className="d-flex align-items-center ms-2">
                    <button
                      type="button"
                      className={`pc-state${current ? " recorded" : ""}${
                        open ? " open" : ""
                      }`}
                      onClick={() => setOpenId(open ? null : id)}
                      title={current ? "重新记录" : "记录这次练习"}
                    >
                      {attemptLabel(current)}
                    </button>
                  </div>
                </div>
                {open && (
                  <ProgressRecordPanel
                    qid={id}
                    questionTitle={item.title}
                    source="zen"
                    className="pc-panel"
                    onRecorded={() => setOpenId(null)}
                    onCancel={() => setOpenId(null)}
                  />
                )}
              </li>
            );
          })}
      </ul>
    </div>
  );
}

export default ProblemCategoryList;
