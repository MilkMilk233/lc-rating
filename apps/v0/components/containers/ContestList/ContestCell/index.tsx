import { useLeetCodeLanguage } from "@hooks/useLeetCodeLanguage";
import useStorage from "@hooks/useStorage";
import { leetCodeContestUrl } from "@utils/leetcodeLinks";
import React from "react";
import Form from "react-bootstrap/Form";

function openUrl(url: string) {
  window.open(url, "_blank");
}

interface ContestCellProps {
  title: string;
  titleSlug: string;
}

function ContestCell({ title, titleSlug }: ContestCellProps) {
  const { language } = useLeetCodeLanguage();
  const [mark, setMark] = useStorage<string>("__mark", {
    defaultValue: "",
  });

  let link = leetCodeContestUrl(titleSlug, language);
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    openUrl(link);
  };
  const [ck, setCk] = React.useState<boolean>(mark === titleSlug);
  return (
    <div className={ck ? "col-contest row-selected" : "col-contest"}>
      <a href={link} onClick={onClick}>
        {title}
      </a>
      <Form.Group controlId={titleSlug}>
        <Form.Check
          type="checkbox"
          onChange={(e) => {
            setCk(e.target.checked);
            setMark(e.target.checked ? titleSlug : "");
          }}
          checked={ck}
        />
      </Form.Group>
    </div>
  );
}

export default ContestCell;
