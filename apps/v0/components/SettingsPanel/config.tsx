import { BiSolidCustomize } from "react-icons/bi";
import { LuArrowUpDown } from "react-icons/lu";
import CustomizeOptions from "./settingPages/CustomizeOptions";
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
  {
    key: "CustomizeOptions",
    title: "自定义进度选项",
    icon: <BiSolidCustomize />,
    component: <CustomizeOptions />,
  },
];
