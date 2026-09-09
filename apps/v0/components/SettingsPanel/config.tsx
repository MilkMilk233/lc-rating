import { LuArrowUpDown } from "react-icons/lu";
import LocalProgress from "./settingPages/LocalProgress";

export type SettingTabType = {
  key: string;
  title: string;
  icon: React.ReactNode;
  component: React.ReactNode;
};

export const setting_tabs: SettingTabType[] = [
  {
    key: "LocalProgress",
    title: "备份与导入进度",
    icon: <LuArrowUpDown />,
    component: <LocalProgress />,
  },
];
