import { BrowserRouter as Router, Routes } from "react-router-dom";
import "./App.css";
import { publicRoutesFunc, protectedRoutesFunc } from "./pages/routing";
import { Layout } from "./pages/Layout";
import { CartProvider } from "./context/CartContext";

export default function App() {
  return (
    <CartProvider>
      <Router>
        <Layout>
          <Routes>
            {publicRoutesFunc()}
            {protectedRoutesFunc()}
          </Routes>
        </Layout>
      </Router>
    </CartProvider>
  );
}
