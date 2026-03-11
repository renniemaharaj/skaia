import { BrowserRouter as Router, Routes } from "react-router-dom";
import "./App.css";
import { publicRoutesFunc, protectedRoutesFunc } from "./pages/routing";
import { Layout } from "./pages/Layout";
import { CartProvider } from "./context/CartContext";
import { ThemeProvider } from "./hooks/theme/ThemeProvider";
import ErrorBoundary from "./ErrorBoundary";
import { useSiteConfig } from "./hooks/useSiteConfig";
import SiteHead from "./components/SiteHead";

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
  return (
    <CartProvider>
      <Router>
        <ThemeProvider>
          <SiteConfigLoader>
            <Layout>
              <ErrorBoundary>
                <Routes>
                  {publicRoutesFunc()}
                  {protectedRoutesFunc()}
                </Routes>
              </ErrorBoundary>
            </Layout>
          </SiteConfigLoader>
        </ThemeProvider>
      </Router>
    </CartProvider>
  );
}
