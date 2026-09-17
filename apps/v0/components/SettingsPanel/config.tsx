import type { MessageKey } from "@hooks/useI18n";
import { LuArrowUpDown } from "react-icons/lu";
import LocalProgress from "./settingPages/LocalProgress";

export type SettingTabType = {
  key: string;
  /** Resolved through the message dictionary by the sidebar. */
  titleKey: MessageKey;
  icon: React.ReactNode;
  component: React.ReactNode;
};

export const setting_tabs: SettingTabType[] = [
  {
    key: "LocalProgress",
    titleKey: "settings.backup",
    icon: <LuArrowUpDown />,
    component: <LocalProgress />,
  },
];
