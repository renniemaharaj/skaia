import { useLocation } from "react-router-dom";
import { SkeletonPrimitive, SkeletonText } from "../components/ui/Skeleton";
import "./LoadingPage.css";

export type RouteLoadingFamily =
  | "canvas"
  | "commerce"
  | "documentation"
  | "feed"
  | "form"
  | "page"
  | "profile"
  | "reader"
  | "table";

interface LoadingPageProps {
  message?: string;
  subMessage?: string;
}

export function routeLoadingFamily(pathname: string): RouteLoadingFamily {
  if (pathname === "/" || /^\/(privacy|tos)(\/|$)/.test(pathname)) return "page";
  if (/^\/(page|pages)(\/|$)/.test(pathname)) return "page";
  if (/^\/(store|product|orders?|cart|wallet)(\/|$)/.test(pathname)) return "commerce";
  if (/^\/(doc|documentation)(\/|$)/.test(pathname)) return "documentation";
  if (/^\/(users?|uploads|settings)(\/|$)/.test(pathname)) return "profile";
  if (/^\/(forum|threads?|inbox|activity)(\/|$)/.test(pathname)) return "feed";
  if (/^\/(datasources?|deployments?|admin|roles|trash)(\/|$)/.test(pathname)) return "table";
  if (/^\/kjv(\/|$)/.test(pathname)) return "reader";
  if (/^\/(flow|visualizer|stream|clipmaker)(\/|$)/.test(pathname)) return "canvas";
  if (
    /^\/(form|login|register|forgot-password|reset-password|verify-email|new-thread|edit-thread)(\/|$)/.test(
      pathname
    )
  ) {
    return "form";
  }
  return "feed";
}

function PageShell() {
  return (
    <>
      <div className="route-skeleton__hero">
        <SkeletonPrimitive width="40%" height={36} />
        <SkeletonPrimitive width="55%" height={18} />
      </div>
      <div className="route-skeleton__cards">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="route-skeleton__card" key={`page-card-${index}`}>
            <SkeletonPrimitive width="58%" height={22} />
            <SkeletonText />
          </div>
        ))}
      </div>
    </>
  );
}

function CommerceShell() {
  return (
    <div className="route-skeleton__content">
      <div className="route-skeleton__title">
        <SkeletonPrimitive width="34%" height={30} />
      </div>
      <div className="route-skeleton__product-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="route-skeleton__product" key={`product-${index}`}>
            <SkeletonPrimitive shape="media" />
            <SkeletonPrimitive width="62%" height={20} />
            <SkeletonPrimitive width="34%" height={18} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitShell({ family }: { family: "documentation" | "reader" }) {
  return (
    <div className={`route-skeleton__split route-skeleton__split--${family}`}>
      <aside className="route-skeleton__sidebar">
        <SkeletonPrimitive width="66%" height={24} />
        <SkeletonText lines={7} widths={["86%", "70%", "78%"]} />
      </aside>
      <article className="route-skeleton__article">
        <SkeletonPrimitive width="48%" height={34} />
        <SkeletonPrimitive width="30%" height={16} />
        <SkeletonText lines={9} widths={["96%", "92%", "88%"]} />
      </article>
    </div>
  );
}

function FeedShell() {
  return (
    <div className="route-skeleton__content route-skeleton__feed">
      <div className="route-skeleton__title">
        <SkeletonPrimitive width="38%" height={30} />
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div className="route-skeleton__feed-row" key={`feed-${index}`}>
          <SkeletonPrimitive shape="avatar" width={48} height={48} />
          <div>
            <SkeletonPrimitive width="42%" height={18} />
            <SkeletonText lines={2} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FormShell() {
  return (
    <div className="route-skeleton__form">
      <SkeletonPrimitive width="46%" height={30} />
      {Array.from({ length: 3 }, (_, index) => (
        <div className="route-skeleton__field" key={`field-${index}`}>
          <SkeletonPrimitive width="28%" height={12} />
          <SkeletonPrimitive width="100%" height={42} />
        </div>
      ))}
      <SkeletonPrimitive width={120} height={42} />
    </div>
  );
}

function ProfileShell() {
  return (
    <div className="route-skeleton__profile">
      <SkeletonPrimitive shape="media" className="route-skeleton__cover" />
      <SkeletonPrimitive
        shape="avatar"
        width={112}
        height={112}
        className="route-skeleton__avatar"
      />
      <div className="route-skeleton__profile-copy">
        <SkeletonPrimitive width="34%" height={28} />
        <SkeletonPrimitive width="22%" height={15} />
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}

function TableShell() {
  return (
    <div className="route-skeleton__content">
      <div className="route-skeleton__table-title">
        <SkeletonPrimitive width="32%" height={30} />
        <SkeletonPrimitive width={112} height={38} />
      </div>
      <div className="route-skeleton__table">
        {Array.from({ length: 6 }, (_, row) => (
          <div className="route-skeleton__table-row" key={`table-${row}`}>
            <SkeletonPrimitive width="54%" height={14} />
            <SkeletonPrimitive width="42%" height={14} />
            <SkeletonPrimitive width="50%" height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CanvasShell() {
  return (
    <div className="route-skeleton__canvas-shell">
      <div className="route-skeleton__canvas-toolbar">
        <SkeletonPrimitive width={94} height={32} />
        <SkeletonPrimitive width={72} height={32} />
        <SkeletonPrimitive width={110} height={32} />
      </div>
      <SkeletonPrimitive className="route-skeleton__canvas" />
    </div>
  );
}

export default function LoadingPage({ message = "Loading page", subMessage }: LoadingPageProps) {
  const family = routeLoadingFamily(useLocation().pathname);
  return (
    <main
      className={`loading-page route-skeleton route-skeleton--${family}`}
      role="status"
      aria-busy="true"
      aria-label={message}
    >
      {subMessage && <span className="route-skeleton__announcement">{subMessage}</span>}
      {family === "page" && <PageShell />}
      {family === "commerce" && <CommerceShell />}
      {(family === "documentation" || family === "reader") && <SplitShell family={family} />}
      {family === "feed" && <FeedShell />}
      {family === "form" && <FormShell />}
      {family === "profile" && <ProfileShell />}
      {family === "table" && <TableShell />}
      {family === "canvas" && <CanvasShell />}
    </main>
  );
}
