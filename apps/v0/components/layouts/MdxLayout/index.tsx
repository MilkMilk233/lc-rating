"use client";

import { Route } from "@app/(algo)/code/layout";
import { useI18n } from "@hooks/useI18n";
import Link from "next/link";
import { useMemo, useState } from "react";

interface MaxLayoutProps {
  children: React.ReactNode;
  routes: Route[];
}

export default function MdxLayout({ children, routes = [] }: MaxLayoutProps) {
  const { isCn, isEn, t, toggle } = useI18n();
  const [selected, setSelected] = useState(routes[0].path);
  const code = useMemo(
    () => routes.find((r) => r.path === selected),
    [selected]
  );

  const handleClick = (_: React.MouseEvent<HTMLElement>, r: Route) => {
    setSelected(r.path);
  };

  return (
    <div className="debug mdx-layout">
      <nav className="top-nav">
        <Link href="/code">My Code Templates</Link>
        {/* This route group has its own layout, so the site navbar (and with it
            the language switch) is not on the page. The template bodies are
            Chinese-only prose, which makes switching in either direction the
            only way to read the note below. */}
        <button
          type="button"
          className="mdx-lang-toggle"
          onClick={toggle}
          aria-label={t("nav.language")}
          title={t("nav.language")}
        >
          <span className={isCn ? "active" : ""}>CN</span>
          <span className={isEn ? "active" : ""}>EN</span>
        </button>
      </nav>
      <aside className="side-nav">
        <ul>
          {routes.map((r, idx) => {
            return (
              <li
                key={`menu-item-${idx}`}
                className={
                  r.path === selected ? "menu-item active" : "menu-item"
                }
                onClick={(_) => handleClick(_, r)}
              >
                {t(r.displayKey)}
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="content">
        {/* These templates are Chinese-only prose, so the English UI says so
            rather than half-translating the chrome. The note belongs to the
            content column: the side nav is fixed, so a banner at the top of
            the grid would land underneath it. */}
        {isEn ? <p className="mdx-lang-note">{t("content.chineseOnly")}</p> : null}
        {code?.mdx ?? ""}
      </div>
    </div>
  );
}
