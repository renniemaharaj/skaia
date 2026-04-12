import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Crown,
  Users,
  UserCog2Icon,
  ExternalLink,
  Search,
} from "lucide-react";
import { apiRequest } from "../../utils/api";
import { relativeTimeAgo } from "../../utils/serverTime";
import type { PageBuilderPage, PageUser } from "../../hooks/usePageData";
import "./CustomPages.css";

export default function CustomPages() {
  const [pages, setPages] = useState<PageBuilderPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiRequest<PageBuilderPage[]>("/config/pages/browse")
      .then((data) => setPages(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return pages;
    const q = search.toLowerCase();
    return pages.filter(
      (p) =>
        (p.title ?? "").toLowerCase().includes(q) ||
        (p.slug ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [pages, search]);

  const UserChip = ({ user }: { user: PageUser }) => (
    <span className="cp-user-chip">
      <span className="cp-user-chip__avatar">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt={user.display_name || user.username} />
        ) : (
          <UserCog2Icon size={12} />
        )}
      </span>
      <span className="cp-user-chip__name">
        {user.display_name || user.username}
      </span>
    </span>
  );

  return (
    <div className="custom-pages">
      <div className="custom-pages__header">
        <div className="custom-pages__header-left">
          <h1 className="custom-pages__title">
            <FileText size={22} />
            Custom Pages
          </h1>
          <p className="custom-pages__subtitle">
            Browse community-created pages
          </p>
        </div>
        {pages.length > 0 && (
          <div className="custom-pages__search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search pages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {loading && <p className="custom-pages__status">Loading pages…</p>}

      {!loading && pages.length === 0 && (
        <div className="custom-pages__empty card">
          <FileText size={32} />
          <p>No custom pages yet.</p>
        </div>
      )}

      {!loading && pages.length > 0 && (
        <>
          <p className="custom-pages__count">
            {filtered.length} {filtered.length === 1 ? "page" : "pages"}
            {search && ` matching "${search}"`}
          </p>
          <div className="custom-pages__grid">
            {filtered.map((page) => (
              <Link
                key={page.id}
                to={page.is_index ? "/" : `/page/${page.slug}`}
                className="cp-card card card--interactive"
              >
                <div className="cp-card__top">
                  <h3 className="cp-card__title">{page.title || page.slug}</h3>
                  <ExternalLink size={14} className="cp-card__link-icon" />
                </div>

                {page.description && (
                  <p className="cp-card__desc">{page.description}</p>
                )}

                <div className="cp-card__meta">
                  {page.owner && (
                    <div className="cp-card__meta-row">
                      <Crown size={12} />
                      <UserChip user={page.owner} />
                    </div>
                  )}
                  {page.editors && page.editors.length > 0 && (
                    <div className="cp-card__meta-row">
                      <Users size={12} />
                      <span className="cp-card__editors">
                        {page.editors.slice(0, 3).map((e) => (
                          <UserChip key={e.id} user={e} />
                        ))}
                        {page.editors.length > 3 && (
                          <span className="cp-card__more">
                            +{page.editors.length - 3}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  <span className="cp-card__time">
                    Updated {relativeTimeAgo(page.updated_at)}
                  </span>
                </div>

                {page.is_index && (
                  <span className="cp-card__badge">Homepage</span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
