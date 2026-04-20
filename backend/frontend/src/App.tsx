import { BrowserRouter as Router, Routes } from "react-router-dom";
import "./App.css";
import {
  publicRoutesFunc,
  protectedRoutesFunc,
  guestRoutesFunc,
} from "./pages/routing";
import { Layout } from "./pages/Layout";
import { ThemeProvider } from "./hooks/theme/ThemeProvider";
import ErrorBoundary from "./ErrorBoundary";
import { useSiteConfig } from "./hooks/useSiteConfig";
import SiteHead from "./components/SiteHead";
import { useFeatures } from "./hooks/useFeatures";
import { useGuestSandboxMode } from "./hooks/useGuestSandboxMode";
import GrengoSessionDialog from "./components/admin/GrengoSessionDialog";

function SiteConfigLoader({ children }: { children: React.ReactNode }) {
  const { branding, seo } = useSiteConfig();
  return (
    <>
      <SiteHead seo={seo} branding={branding} />
      {children}
    </>
  );
}

export default function App() {
  const features = useFeatures();
  const [guestSandboxMode] = useGuestSandboxMode();

  return (
    <Router>
      <ThemeProvider>
        <SiteConfigLoader>
          <Layout>
            <ErrorBoundary>
              <Routes>
                {publicRoutesFunc(features, guestSandboxMode)}
                {guestRoutesFunc(features, guestSandboxMode)}
                {protectedRoutesFunc(features, guestSandboxMode)}
              </Routes>
            </ErrorBoundary>
            <GrengoSessionDialog />
          </Layout>
        </SiteConfigLoader>
      </ThemeProvider>
    </Router>
  );
}
