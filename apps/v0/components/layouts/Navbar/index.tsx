"use client";

import SettingsPanel from "@components/SettingsPanel";
import ThemeSwitchButton from "@components/ThemeSwitchButton";
import { useTheme } from "@hooks/useTheme";
import Link from "next/link";
import { useState } from "react";
import { Button, Container, Dropdown, Nav, Navbar } from "react-bootstrap";

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
  const [showModal, setShowModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleOpenModal = () => {
    setShowModal(true);
  };
  const handleCloseModal = () => {
    setShowModal(false);
  };

  return (
    <Navbar sticky="top" className="p-0">
      <Container className="">
        <Navbar.Brand>力扣竞赛题目</Navbar.Brand>
        <div className="d-flex flex-fill d-md-none d-lg-none justify-content-end pe-2">
          <span
            className="btn d-flex rounded-circle p-1"
            onClick={() => {
              toggleTheme();
            }}
          >
            <ThemeSwitchButton height={24} width={24} theme={theme} />
          </span>
        </div>
        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse
          id="responsive-navbar-nav"
          className="justify-content-end"
        >
          <Nav className="me-auto">
            <Link
              href="/"
              className="nav-link"
              style={{
                width: "fit-content",
              }}
            >
              <Button id="nav-cl" className="fw-bold fs-6 p-1">
                竞赛列表
              </Button>
            </Link>

            <Link
              href="/zen"
              className="nav-link"
              style={{
                width: "fit-content",
              }}
            >
              <Button id="nav-tr" className="fw-bold fs-6 p-1">
                难度练习
              </Button>
            </Link>

            <Link
              href="/search"
              className="nav-link"
              style={{
                width: "fit-content",
              }}
            >
              <Button id="nav-0x3f" className="fw-bold fs-6 p-1">
                💡0x3F
              </Button>
            </Link>

            <Link
              href="#"
              className="nav-link"
              style={{
                width: "fit-content",
              }}
            >
              <Button
                id="nav-pg"
                className="fw-bold fs-6 p-1"
                onClick={handleOpenModal}
              >
                站点设置
              </Button>
            </Link>
            <SettingsPanel show={showModal} onHide={handleCloseModal} />

            <Dropdown
              className="nav-link"
              show={showDropdown}
              onToggle={(showDropdown) => setShowDropdown(showDropdown)}
            >
              <Dropdown.Toggle id="nav-pl">📑题单</Dropdown.Toggle>

              <Dropdown.Menu>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "10px",
                    padding: "10px",
                  }}
                >
                  {questList.map((item) => (
                    <Link
                      key={item.link}
                      href={item.link}
                      className="text-center"
                    >
                      <Button
                        className="fw-bold w-100"
                        style={{
                          whiteSpace: "nowrap",
                        }}
                        onClick={() => setShowDropdown(false)}
                      >
                        📑{item.title}
                      </Button>
                    </Link>
                  ))}
                </div>
              </Dropdown.Menu>
            </Dropdown>
          </Nav>
          <span className="navbar-brand fs-6 fw-semibold">
            题解来自{" "}
            <Link
              href="https://space.bilibili.com/206214/"
              target="_blank"
              className="link fw-bold text-danger"
            >
              bilibili@灵茶山艾府
            </Link>{" "}
            感谢！
          </span>
          <span
            className="btn d-flex rounded-circle p-1 d-none d-lg-block d-xl-block d-sm-none"
            onClick={() => {
              toggleTheme();
            }}
          >
            <ThemeSwitchButton height={24} width={24} theme={theme} />
          </span>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
