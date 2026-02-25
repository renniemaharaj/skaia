import { BrowserRouter as Router, Routes } from "react-router-dom";
import "./App.css";
import { publicRoutesFunc, protectedRoutesFunc } from "./pages/routing";
import { Layout } from "./pages/Layout";

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {publicRoutesFunc()}
          {protectedRoutesFunc()}
        </Routes>
      </Layout>
    </Router>
  );
}
