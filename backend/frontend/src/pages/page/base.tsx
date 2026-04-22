import { type ReactNode } from "react";
import { Header } from "./layout/Header";
// import { Footer } from "./layout/Footer";
import { useAtom } from "jotai";
import { layoutModeAtom } from "../../atoms/layoutMode";
import "../../styles/Base.css";

interface BaseLayoutProps {
  children: ReactNode;
  isDarkMode: boolean;
  onDarkModeToggle: (isDark: boolean) => void;
}

export const BaseLayout: React.FC<BaseLayoutProps> = ({
  children,
  isDarkMode,
  onDarkModeToggle,
}) => {
  const [layoutMode, setLayoutMode] = useAtom(layoutModeAtom);
  return (
    <div className="base-layout">
      <Header
        cartCount={0}
        isDarkMode={isDarkMode}
        onDarkModeToggle={onDarkModeToggle}
        layoutMode={layoutMode}
        onToggleLayoutMode={() =>
          setLayoutMode(layoutMode === "application" ? "web" : "application")
        }
      />
      <main className="base-main">
        <div className="base-content">{children}</div>
      </main>
      {/* <Footer /> */}
    </div>
  );
};
