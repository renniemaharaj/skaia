import { BookOpen, ExternalLink, Menu, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { DocumentHeading } from "./headings";
import "./DocumentationShell.css";

export interface DocumentationNavArticle {
  id: string | number;
  title: string;
  href: string;
  active?: boolean;
  meta?: string;
}

export interface DocumentationNavSection {
  id: string | number;
  title: string;
  articles: DocumentationNavArticle[];
  actions?: ReactNode;
}

interface DocumentationShellProps {
  title: string;
  description?: string;
  catalogHref: string;
  catalogLabel: string;
  sections: DocumentationNavSection[];
  headings?: DocumentHeading[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchResults?: ReactNode;
  sidebarActions?: ReactNode;
  headerActions?: ReactNode;
  previous?: { href: string; title: string };
  next?: { href: string; title: string };
  children: ReactNode;
  variant?: "page" | "embedded";
  openHref?: string;
}

function NavigationGroups({
  sections,
  onNavigate,
}: {
  sections: DocumentationNavSection[];
  onNavigate?: () => void;
}) {
  return (
    <nav className="documentation-navigation">
      {sections.map(section => (
        <section key={section.id} className="documentation-navigation__group">
          <div className="documentation-navigation__label">
            <span>{section.title}</span>
            {section.actions}
          </div>
          {section.articles.map(article => (
            <Link
              key={article.id}
              className={article.active ? "is-active" : undefined}
              to={article.href}
              onClick={onNavigate}
            >
              <span>{article.title}</span>
              {article.meta && <small>{article.meta}</small>}
            </Link>
          ))}
        </section>
      ))}
    </nav>
  );
}

export function DocumentationShell({
  title,
  description,
  catalogHref,
  catalogLabel,
  sections,
  headings = [],
  searchValue,
  onSearchChange,
  searchResults,
  sidebarActions,
  headerActions,
  previous,
  next,
  children,
  variant = "page",
  openHref,
}: DocumentationShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSidebarOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sidebarOpen]);

  const closeSidebar = () => setSidebarOpen(false);

  if (variant === "embedded") {
    return (
      <div className="documentation-shell documentation-shell--embedded">
        <aside className="documentation-sidebar" aria-label="Documentation navigation">
          <div className="documentation-sidebar__header">
            <BookOpen size={18} aria-hidden="true" />
            <strong>{title}</strong>
          </div>
          <NavigationGroups sections={sections} />
        </aside>
        <div className="documentation-content">
          <header className="documentation-topbar">
            <div className="documentation-topbar__title">
              <strong>{title}</strong>
              {description && <span>{description}</span>}
            </div>
            {openHref && (
              <Link className="documentation-embedded-open" to={openHref}>
                Open documentation <ExternalLink size={14} />
              </Link>
            )}
          </header>
          <div className="documentation-grid">
            <main className="documentation-article">{children}</main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="documentation-shell">
      <button
        className={`documentation-scrim${sidebarOpen ? " is-visible" : ""}`}
        aria-label="Close documentation navigation"
        type="button"
        onClick={closeSidebar}
      />
      <aside
        className={`documentation-sidebar${sidebarOpen ? " is-open" : ""}`}
        aria-label="Documentation navigation"
      >
        <div className="documentation-sidebar__header">
          <Link to={catalogHref} className="documentation-brand" onClick={closeSidebar}>
            <BookOpen size={18} />
            <span>{catalogLabel}</span>
          </Link>
          <button
            ref={closeButton}
            className="action-btn documentation-sidebar__close"
            type="button"
            aria-label="Close navigation"
            onClick={closeSidebar}
          >
            <X size={18} />
          </button>
        </div>
        <label className="documentation-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search documentation"
            autoComplete="off"
            value={searchValue}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Search guides…"
          />
        </label>
        {searchResults}
        {sidebarActions}
        <NavigationGroups sections={sections} onNavigate={closeSidebar} />
      </aside>

      <div className="documentation-content">
        <header className="documentation-topbar">
          <button
            ref={menuButton}
            type="button"
            className="action-btn documentation-menu"
            aria-label="Open documentation navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="documentation-topbar__title">
            <strong>{title}</strong>
            {description && <span>{description}</span>}
          </div>
          <div className="documentation-topbar__actions">{headerActions}</div>
        </header>
        <div className="documentation-grid">
          <main className="documentation-article" id="main-content">
            {children}
            {(previous || next) && (
              <nav className="documentation-pagination" aria-label="Guide pagination">
                {previous ? <Link to={previous.href}>Previous: {previous.title}</Link> : <span />}
                {next ? <Link to={next.href}>Next: {next.title}</Link> : <span />}
              </nav>
            )}
          </main>
          {headings.length > 0 && (
            <aside className="documentation-outline" aria-label="On this page">
              <strong>On this page</strong>
              {headings.map(heading => (
                <a key={heading.id} className={`level-${heading.level}`} href={`#${heading.id}`}>
                  {heading.text}
                </a>
              ))}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
