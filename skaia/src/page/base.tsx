import { type ReactNode } from "react";
import { Header, Footer } from "../components";
import "../styles/Base.css";

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
  return (
    <div className="base-layout">
      <Header
        cartCount={0}
        isDarkMode={isDarkMode}
        onDarkModeToggle={onDarkModeToggle}
      />
      <main className="base-main">
        <div className="base-content">{children}</div>
      </main>
      <Footer />
    </div>
  );
};
