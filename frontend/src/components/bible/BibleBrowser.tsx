import { BookOpen, BookOpenCheck, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useLayoutPosition } from "../../atoms/viewModes";
import Select from "../ui/Select";
import { DirectoryLayout, type ViewMode } from "../page/layout/templates/DirectoryLayout";
import type { TableColumn } from "../ui/TableView/TableView";
import BookTile from "./BookTile";
import type { BibleBookSummary, BibleCatalog } from "./types";

interface BibleBrowserProps {
  catalog: BibleCatalog;
  activeBookSlug: string;
  loadingBookSlug: string;
  onSelectBook: (book: BibleBookSummary) => void;
  compact?: boolean;
}

interface BibleDivision {
  name: string;
  order: number;
}

function listDivisions(books: BibleBookSummary[]): BibleDivision[] {
  const divisions = new Map<string, number>();
  for (const book of books) {
    divisions.set(book.division, book.division_order);
  }
  return Array.from(divisions, ([name, order]) => ({ name, order })).sort(
    (left, right) => left.order - right.order
  );
}

function matchesSearch(book: BibleBookSummary, search: string): boolean {
  const searchable = `${book.title} ${book.testament} ${book.division}`.toLowerCase();
  return searchable.includes(search);
}

export default function BibleBrowser({
  catalog,
  activeBookSlug,
  loadingBookSlug,
  onSelectBook,
  compact = false,
}: BibleBrowserProps) {
  const [search, setSearch] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [viewMode, setViewMode] = useLayoutPosition<ViewMode>(
    compact ? "biblePicker" : "bibleBooks",
    compact ? "list" : "grid"
  );
  const divisions = useMemo(() => listDivisions(catalog.books), [catalog.books]);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleBooks = useMemo(() => {
    const candidates =
      normalizedSearch || selectedDivision === "all"
        ? catalog.books
        : catalog.books.filter(book => book.division === selectedDivision);
    return normalizedSearch
      ? candidates.filter(book => matchesSearch(book, normalizedSearch))
      : candidates;
  }, [catalog.books, normalizedSearch, selectedDivision]);

  const openBook = (book: BibleBookSummary) => {
    if (book.slug !== loadingBookSlug) onSelectBook(book);
  };

  const tableColumns = useMemo<TableColumn<BibleBookSummary>[]>(
    () => [
      {
        id: "book",
        header: "Book",
        width: "minmax(11rem, 2fr)",
        className: "table-view__cell--bold",
        cell: book => (
          <span className="bible-book-table__title">
            {book.slug === activeBookSlug ? (
              <BookOpenCheck size={15} aria-hidden="true" />
            ) : (
              <BookOpen size={15} aria-hidden="true" />
            )}
            {book.title}
          </span>
        ),
      },
      {
        id: "testament",
        header: "Testament",
        width: "minmax(8.5rem, 1fr)",
        className: "table-view__cell--muted",
        cell: book => book.testament,
      },
      {
        id: "division",
        header: "Division",
        width: "minmax(11rem, 1.5fr)",
        className: "table-view__cell--muted",
        cell: book => book.division,
      },
      {
        id: "chapters",
        header: "Chapters",
        width: "5.5rem",
        className: "table-view__cell--center",
        cell: book => book.chapter_count,
      },
      {
        id: "verses",
        header: "Verses",
        width: "5.5rem",
        className: "table-view__cell--center",
        cell: book => book.verse_count.toLocaleString(),
      },
      {
        id: "open",
        header: "Open",
        width: "4rem",
        className: "table-view__cell--actions",
        cell: book => (
          <span className="bible-book-table__open" aria-hidden="true">
            {book.slug === loadingBookSlug ? "…" : <ChevronRight size={16} />}
          </span>
        ),
      },
    ],
    [activeBookSlug, loadingBookSlug]
  );

  return (
    <DirectoryLayout
      className={`bible-directory${compact ? " bible-directory--compact" : " card"}`}
      title={compact ? "KJV books" : "Holy Bible"}
      subtitle={
        compact
          ? "Search or switch views to choose a book."
          : "Browse all 66 books of the King James Version."
      }
      searchPlaceholder="Search books, divisions, or testaments…"
      searchValue={search}
      onSearchChange={setSearch}
      metrics={[
        <span key="visible">
          <strong>{visibleBooks.length}</strong> {visibleBooks.length === 1 ? "book" : "books"}
        </span>,
        <span key="translation">KJV</span>,
      ]}
      headerActions={
        <Select
          size="sm"
          aria-label="Filter Bible division"
          value={selectedDivision}
          options={[
            { value: "all", label: "All divisions" },
            ...divisions.map(division => ({
              value: division.name,
              label: division.name,
            })),
          ]}
          onChange={event => setSelectedDivision(event.target.value)}
        />
      }
      items={visibleBooks}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      renderGridCard={book => (
        <BookTile
          key={book.slug}
          book={book}
          active={book.slug === activeBookSlug}
          loading={book.slug === loadingBookSlug}
          onSelect={() => openBook(book)}
        />
      )}
      tableColumns={tableColumns}
      tableRowKey={book => book.slug}
      renderRowWrapper={(book, _index, rowProps, cells) => (
        <div
          {...rowProps}
          role="button"
          tabIndex={book.slug === loadingBookSlug ? -1 : 0}
          aria-label={`Open ${book.title}`}
          aria-pressed={book.slug === activeBookSlug}
          aria-disabled={book.slug === loadingBookSlug || undefined}
          className={`${rowProps.className} bible-book-table__row${
            book.slug === activeBookSlug ? " bible-book-table__row--active" : ""
          }`}
          onClick={() => openBook(book)}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openBook(book);
            }
          }}
        >
          {cells}
        </div>
      )}
      emptyState={
        <div className="ui-empty">
          No KJV books match {search ? `“${search}”` : "this division"}.
        </div>
      }
      tableEmptyState={
        <div className="ui-empty">
          No KJV books match {search ? `“${search}”` : "this division"}.
        </div>
      }
    />
  );
}
