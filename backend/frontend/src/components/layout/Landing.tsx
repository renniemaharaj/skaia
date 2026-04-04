import PageBuilder from "../../pages/page/PageBuilder";
import "./Landing.css";
import "../ui/FeatureCard.css";

/**
 * Landing page — renders the default index page via PageBuilder.
 * If no Page entity exists for the index route, PageBuilder falls back
 * to the legacy landing API (`/config/landing`) so existing sites keep working.
 */
export const Landing: React.FC = () => <PageBuilder />;
