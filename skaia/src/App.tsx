import { BrowserRouter as Router, Routes } from "react-router-dom";
import "./App.css";
import { publicRoutesFunc, protectedRoutesFunc } from "./pages/routing";
import { Layout } from "./pages/Layout";
import { CartProvider } from "./context/CartContext";
import { ThemeProvider } from "./hooks/theme/ThemeProvider";
import ErrorBoundary from "./ErrorBoundary";

export default function App() {
  return (
    <CartProvider>
      <Router>
        <ThemeProvider>
          <Layout>
            <ErrorBoundary>
              <Routes>
                {publicRoutesFunc()}
                {protectedRoutesFunc()}
              </Routes>
            </ErrorBoundary>
          </Layout>
        </ThemeProvider>
      </Router>
    </CartProvider>
  );
}
