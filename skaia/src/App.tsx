import { BrowserRouter as Router, Routes } from "react-router-dom";
import "./App.css";
import { publicRoutesFunc, protectedRoutesFunc } from "./pages/routing";
import { Layout } from "./pages/Layout";
import { CartProvider } from "./context/CartContext";
import { ThemeProvider } from "./hooks/theme/ThemeProvider";

export default function App() {
  return (
    <CartProvider>
      <Router>
        <ThemeProvider>
          <Layout>
            <Routes>
              {publicRoutesFunc()}
              {protectedRoutesFunc()}
            </Routes>
          </Layout>
        </ThemeProvider>
      </Router>
    </CartProvider>
  );
}
