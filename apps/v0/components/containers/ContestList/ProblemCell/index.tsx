import RatingCircle, { COLORS } from "@components/RatingCircle";
import { QuestionType } from "@hooks/useContests";
import { useLeetCodeLanguage } from "@hooks/useLeetCodeLanguage";
import { SolutionType } from "@hooks/useSolutions";
import { leetCodeProblemUrl, leetCodeSolutionUrl } from "@utils/leetcodeLinks";
import clsx from "clsx";
import React, { useEffect, useState } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import Spinner from "react-bootstrap/Spinner";

function openUrl(url: string) {
  window.open(url, "_blank");
}

interface ProblemCellProps {
  question: QuestionType;
  solution: SolutionType;
}

function ProblemCell({ question: que, solution: soln }: ProblemCellProps) {
  const { language } = useLeetCodeLanguage();
  let link = leetCodeProblemUrl(que.title_slug, language);
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    openUrl(link);
  };
  let rating = que.rating;
  let idx = COLORS.findIndex((v) => rating >= v.l && rating <= v.r);
  let placement = `${rating}`;

  const [display, setDisplay] = useState(true);

  useEffect(() => {
    setTimeout(() => setDisplay(false), 5000);
  });

  return (
    <div>
      <OverlayTrigger
        trigger={["hover", "focus"]}
        key={placement}
        placement={"bottom"}
        overlay={
          <Popover id={`popover-positioned-${placement}`}>
            {/* <Popover.Header as="h3">{`Popover ${placement}`}</Popover.Header> */}
            <Popover.Body
              className={clsx(`rating-color-${idx}`, "ff-st")}
              style={{ fontSize: "1.2rem" }}
            >
              <strong>难度: </strong> {rating.toFixed(2)}
            </Popover.Body>
          </Popover>
        }
      >
        <RatingCircle rating={rating} />
      </OverlayTrigger>
      <a
        href={link}
        onClick={onClick}
        className={clsx(
          `rating-color-${idx}`,
          "ff-st"
        )} /* style={{color: `var(--rating-color-${idx})`}} */
      >
        {que.question_id}.{que.title}
      </a>
      {soln && (
        <div className="fr-wrapper">
          <OverlayTrigger
            trigger={["hover", "focus"]}
            key={placement}
            placement={"bottom"}
            overlay={
              <Popover id={`popover-positioned-${placement}`}>
                <Popover.Body
                  className={clsx(`rating-color-${idx}`, "ff-st")}
                  style={{ fontSize: "1rem" }}
                >
                  {soln.solnTitle}
                </Popover.Body>
              </Popover>
            }
          >
            <a
              className="fr ans"
              href={leetCodeSolutionUrl(soln.questSlug, soln.solnSlug, language)}
            >
              🎈
            </a>
          </OverlayTrigger>
        </div>
      )}
      {!soln && display && (
        <div className="fr-wrapper zen-spinner-td">
          <Spinner animation="border" size="sm" role="status" />
        </div>
      )}
    </div>
  );
}

export default ProblemCell;
