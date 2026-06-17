import { Suspense } from "react";
import { BrowserRouter as Router, Routes } from "react-router-dom";
import "./App.css";
import ErrorBoundary from "./ErrorBoundary";
import SiteHead from "./components/SiteHead";
import GrengoSessionDialog from "./components/admin/GrengoSessionDialog";
import { ThemeProvider } from "./hooks/theme/ThemeProvider";
import { useFeatures } from "./hooks/useFeatures";
import { useGuestSandboxMode } from "./hooks/useGuestSandboxMode";
import { useSiteConfig } from "./hooks/useSiteConfig";
import { Layout } from "./pages/Layout";
import { guestRoutesFunc, protectedRoutesFunc, publicRoutesFunc } from "./pages/routing";

function SiteConfigLoader({ children }: { children: React.ReactNode }) {
  const { branding, seo } = useSiteConfig();
  return (
    <>
      <SiteHead seo={seo} branding={branding} />
      {children}
    </>
  );
}

import LoadingPage from "./pages/LoadingPage";

export default function App() {
  const features = useFeatures();
  const [guestSandboxMode] = useGuestSandboxMode();

  return (
    <Router>
      <ThemeProvider>
        <SiteConfigLoader>
          <Layout>
            <ErrorBoundary>
              <Suspense fallback={<LoadingPage />}>
                <Routes>
                  {publicRoutesFunc(features, guestSandboxMode)}
                  {guestRoutesFunc(features, guestSandboxMode)}
                  {protectedRoutesFunc(features, guestSandboxMode)}
                </Routes>
              </Suspense>
            </ErrorBoundary>
            <GrengoSessionDialog />
          </Layout>
        </SiteConfigLoader>
      </ThemeProvider>
    </Router>
  );
}
