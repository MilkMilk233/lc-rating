import { useI18n } from "@hooks/useI18n";
import { Nav } from "react-bootstrap";
import { SettingTabType } from "./config";

interface SidebarProps {
  tabs: SettingTabType[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

const Sidebar = ({ tabs, activeTab, onTabChange }: SidebarProps) => {
  const { t } = useI18n();
  return (
    <Nav variant="pills" className="flex-column sticky-top">
      {tabs.map((tab) => (
        <Nav.Item key={tab.key}>
          <Nav.Link
            active={activeTab === tab.key}
            onClick={() => onTabChange(tab.key)}
            className="cursor-pointer sidebar-link text-start"
          >
            <span className="mx-2">{tab.icon}</span>
            {t(tab.titleKey)}
          </Nav.Link>
        </Nav.Item>
      ))}
    </Nav>
  );
};

export default Sidebar;
