import { useAtom } from "jotai";
import { AlertCircle, BookOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { biblePreferencesAtom } from "../../atoms/bible";
import BibleBrowser from "../../components/bible/BibleBrowser";
import BibleReader from "../../components/bible/BibleReader";
import { fetchBibleBook, fetchBibleCatalog } from "../../components/bible/api";
import {
  bibleLocationURL,
  parseBibleLocation,
  resolveBibleLocation,
  resolveBookSummary,
} from "../../components/bible/location";
import { isValidBibleSelection } from "../../components/bible/navigation";
import type {
  BibleBook,
  BibleBookSummary,
  BibleCatalog,
  BibleSelection,
  BibleURLMode,
  ResolvedBibleLocation,
} from "../../components/bible/types";
import Button from "../../components/input/Button";
import "./Bible.css";

export default function KJVPage() {
  const [preferences, setPreferences] = useAtom(biblePreferencesAtom);
  const [catalog, setCatalog] = useState<BibleCatalog | null>(null);
  const [book, setBook] = useState<BibleBook | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [bookError, setBookError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [loadingBookSlug, setLoadingBookSlug] = useState("");
  const [urlMode, setURLMode] = useState<BibleURLMode>("query");
  const bookRequestRef = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();

  const loadCatalog = useCallback(() => {
    setCatalogError("");
    fetchBibleCatalog()
      .then(setCatalog)
      .catch(error => {
        setCatalogError(error instanceof Error ? error.message : "Failed to load the KJV catalog.");
      });
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!catalog) return;
    const parsed = parseBibleLocation(location.pathname, location.search);
    setURLMode(parsed.mode);
    if (parsed.error) {
      setLinkError(parsed.error);
      return;
    }

    if (parsed.input) {
      const resolved = resolveBibleLocation(catalog.books, parsed);
      if (!resolved) {
        setLinkError(`“${parsed.input.book}” is not a recognized KJV book.`);
        return;
      }
      setLinkError("");
      const nextSelection: BibleSelection = {
        bookSlug: resolved.bookSlug,
        chapter: resolved.chapter,
        verse: resolved.verse,
        isOpen: resolved.isOpen,
      };
      setPreferences(current => ({ ...current, selection: nextSelection }));
      const canonicalURL = bibleLocationURL(resolved, parsed.mode);
      if (`${location.pathname}${location.search}` !== canonicalURL) {
        navigate(canonicalURL, { replace: true });
      }
      return;
    }

    setLinkError("");
    if (
      preferences.selection.bookSlug &&
      !resolveBookSummary(catalog.books, preferences.selection.bookSlug)
    ) {
      setPreferences(current => ({
        ...current,
        selection: { ...current.selection, bookSlug: "", chapter: "1", verse: "1" },
      }));
    }
  }, [
    catalog,
    location.pathname,
    location.search,
    navigate,
    preferences.selection.bookSlug,
    setPreferences,
  ]);

  useEffect(() => {
    const slug = preferences.selection.bookSlug;
    if (!slug || !catalog) {
      setBook(null);
      setBookError("");
      return;
    }
    const summary = resolveBookSummary(catalog.books, slug);
    if (!summary) return;

    const requestID = bookRequestRef.current + 1;
    bookRequestRef.current = requestID;
    setLoadingBookSlug(summary.slug);
    setBookError("");
    fetchBibleBook(summary.slug)
      .then(result => {
        if (bookRequestRef.current !== requestID) return;
        setBook(result);
      })
      .catch(error => {
        if (bookRequestRef.current !== requestID) return;
        setBook(null);
        setBookError(error instanceof Error ? error.message : `Failed to load ${summary.title}.`);
      })
      .finally(() => {
        if (bookRequestRef.current === requestID) setLoadingBookSlug("");
      });
  }, [catalog, preferences.selection.bookSlug]);

  useEffect(() => {
    if (!book || book.slug !== preferences.selection.bookSlug) return;
    if (!isValidBibleSelection(book, preferences.selection)) {
      setLinkError(
        `${book.title} ${preferences.selection.chapter}:${preferences.selection.verse} does not exist in this corpus.`
      );
    } else {
      setLinkError("");
    }
  }, [book, preferences.selection]);

  const changeSelection = useCallback(
    (selection: BibleSelection, options?: { replace?: boolean }) => {
      if (!catalog) return;
      const summary = resolveBookSummary(catalog.books, selection.bookSlug);
      if (!summary) return;
      const canonicalSelection = { ...selection, bookSlug: summary.slug };
      setPreferences(current => ({ ...current, selection: canonicalSelection }));
      const resolved: ResolvedBibleLocation = {
        ...canonicalSelection,
        bookTitle: summary.title,
        mode: urlMode,
      };
      navigate(bibleLocationURL(resolved, urlMode), { replace: options?.replace ?? false });
    },
    [catalog, navigate, setPreferences, urlMode]
  );

  const selectBook = useCallback(
    (summary: BibleBookSummary) => {
      changeSelection({
        bookSlug: summary.slug,
        chapter: "1",
        verse: "1",
        isOpen: true,
      });
    },
    [changeSelection]
  );

  const validActiveBook =
    book &&
    book.slug === preferences.selection.bookSlug &&
    isValidBibleSelection(book, preferences.selection);

  if (catalogError) {
    return (
      <main className="bible-page">
        <div className="ui-empty bible-page__error" role="alert">
          <AlertCircle size={28} />
          <strong>The KJV catalog could not be loaded.</strong>
          <span>{catalogError}</span>
          <Button variant="primary" onClick={loadCatalog} iconLeft={<RefreshCw size={16} />}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (!catalog) {
    return (
      <main className="bible-page" aria-busy="true">
        <div className="bible-page__loading card">
          <BookOpen size={30} />
          <span>Loading the KJV catalog…</span>
        </div>
      </main>
    );
  }

  return (
    <main className="bible-page">
      <BibleBrowser
        catalog={catalog}
        activeBookSlug={preferences.selection.bookSlug}
        loadingBookSlug={loadingBookSlug}
        onSelectBook={selectBook}
      />

      {(linkError || bookError) && (
        <div className="bible-inline-error section" role="alert">
          <AlertCircle size={20} />
          <div>
            <strong>Scripture could not be opened.</strong>
            <p>{linkError || bookError}</p>
          </div>
        </div>
      )}

      {loadingBookSlug && !validActiveBook && (
        <div className="bible-page__loading section" aria-live="polite">
          <BookOpen size={24} />
          <span>Loading scripture…</span>
        </div>
      )}

      {validActiveBook && !linkError && (
        <BibleReader
          catalog={catalog}
          book={book}
          selection={preferences.selection}
          preferences={preferences}
          loadingBookSlug={loadingBookSlug}
          onSelectionChange={changeSelection}
          onSelectBook={selectBook}
          onPreferencesChange={setPreferences}
        />
      )}

      <section className="bible-corpus-note card" aria-label="KJV corpus information">
        <div>
          <p className="bible-eyebrow">Internal scripture source</p>
          <h2>KJV corpus</h2>
          <p>
            {catalog.translation.books} books · {catalog.translation.chapters.toLocaleString()}{" "}
            chapters · {catalog.translation.verses.toLocaleString()} verses
          </p>
          <small>{catalog.translation.provenance_notice}</small>
        </div>
        <a
          className="sk-btn sk-btn--ghost sk-btn--md"
          href={catalog.translation.source_repository}
          target="_blank"
          rel="noreferrer"
        >
          Review source
        </a>
      </section>
    </main>
  );
}
