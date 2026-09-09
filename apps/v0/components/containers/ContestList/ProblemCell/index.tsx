import RatingCircle, { COLORS } from "@components/RatingCircle";
import { QuestionType } from "@hooks/useContests";
import { useLeetCodeLanguage } from "@hooks/useLeetCodeLanguage";
import { leetCodeProblemUrl } from "@utils/leetcodeLinks";
import clsx from "clsx";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";

interface ProblemCellProps {
  question: QuestionType;
}

function ProblemCell({ question: que }: ProblemCellProps) {
  const { language } = useLeetCodeLanguage();
  let link = leetCodeProblemUrl(que.title_slug, language);
  let rating = que.rating;
  let idx = COLORS.findIndex((v) => rating >= v.l && rating <= v.r);
  let placement = `${rating}`;

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
        target="_blank"
        rel="noreferrer"
        className={clsx(
          `rating-color-${idx}`,
          "ff-st",
        )} /* style={{color: `var(--rating-color-${idx})`}} */
      >
        {que.question_id}.{que.title}
      </a>
    </div>
  );
}

export default ProblemCell;
