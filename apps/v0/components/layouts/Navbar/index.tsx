"use client";

import ThemeSwitchButton from "@components/ThemeSwitchButton";
import { useLeetCodeLanguage } from "@hooks/useLeetCodeLanguage";
import { useTheme } from "@hooks/useTheme";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Container, Dropdown, Nav, Navbar } from "react-bootstrap";
import {
  LuBookOpen,
  LuListChecks,
  LuMedal,
  LuSearch,
  LuTarget,
  LuTrophy,
} from "react-icons/lu";

const questList = [
  {
    title: "滑动窗口",
    link: "/list/slide_window",
  },
  {
    title: "二分查找",
    link: "/list/binary_search",
  },
  {
    title: "单调栈",
    link: "/list/monotonic_stack",
  },
  {
    title: "网格图",
    link: "/list/grid",
  },

  {
    title: "位运算",
    link: "/list/bitwise_operations",
  },
  {
    title: "图论算法",
    link: "/list/graph",
  },
  {
    title: "动态规划",
    link: "/list/dynamic_programming",
  },
  {
    title: "数据结构",
    link: "/list/data_structure",
  },

  {
    title: "数学",
    link: "/list/math",
  },
  {
    title: "贪心",
    link: "/list/greedy",
  },
  {
    title: "树和二叉树",
    link: "/list/trees",
  },
  {
    title: "字符串",
    link: "/list/string",
  },
];

export default function () {
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useLeetCodeLanguage();
  const pathname = usePathname();
  const [showDropdown, setShowDropdown] = useState(false);

  const navItems = [
    { href: "/", label: "竞赛列表", icon: LuTrophy },
    { href: "/zen", label: "难度练习", icon: LuTarget },
    { href: "/search", label: "题解搜索", icon: LuSearch },
  ];

  return (
    <Navbar sticky="top" expand="lg" className="site-navbar">
      <Container fluid="xl" className="site-navbar-inner">
        <Navbar.Brand as={Link} href="/" className="brand-lockup">
          <span className="brand-mark">LC</span>
          <span>
            <span className="brand-title">LC Rating</span>
            <span className="brand-subtitle">contest practice</span>
          </span>
        </Navbar.Brand>
        <div className="d-flex flex-fill d-md-none d-lg-none justify-content-end pe-2">
          <button
            className="theme-toggle"
            aria-label="切换主题"
            onClick={() => {
              toggleTheme();
            }}
          >
            <ThemeSwitchButton height={24} width={24} theme={theme} />
          </button>
        </div>
        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse
          id="responsive-navbar-nav"
          className="justify-content-end"
        >
          <Nav className="me-auto nav-actions">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                href={href}
                prefetch={false}
                className={`nav-action ${pathname === href ? "active" : ""}`}
                key={href}
              >
                <Icon aria-hidden size={17} />
                <span>{label}</span>
              </Link>
            ))}

            <Dropdown
              className="study-plan-menu"
              show={showDropdown}
              onToggle={(showDropdown) => setShowDropdown(showDropdown)}
            >
              <Dropdown.Toggle className="nav-action" variant="link">
                <LuListChecks aria-hidden size={17} />
                题单
              </Dropdown.Toggle>

              <Dropdown.Menu>
                <div className="study-plan-grid">
                  {questList.map((item) => (
                    <Link
                      key={item.link}
                      href={item.link}
                      prefetch={false}
                      className="study-plan-link"
                      onClick={() => setShowDropdown(false)}
                    >
                      <LuBookOpen aria-hidden size={15} />
                      <span>{item.title}</span>
                    </Link>
                  ))}
                </div>
              </Dropdown.Menu>
            </Dropdown>
          </Nav>
          <Link
            href="/profile"
            prefetch={false}
            className={`profile-badge ${pathname === "/profile" ? "active" : ""}`}
            aria-label="打开个人进度"
            title="个人进度"
          >
            <LuMedal aria-hidden size={18} />
          </Link>
          <button
            className="language-toggle"
            onClick={toggleLanguage}
            aria-label="切换 LeetCode 站点语言"
            title="切换 LeetCode 站点语言"
          >
            <span className={language === "cn" ? "active" : ""}>CN</span>
            <span className={language === "en" ? "active" : ""}>EN</span>
          </button>
          <button
            className="theme-toggle d-none d-lg-flex"
            aria-label="切换主题"
            onClick={() => {
              toggleTheme();
            }}
          >
            <ThemeSwitchButton height={24} width={24} theme={theme} />
          </button>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
