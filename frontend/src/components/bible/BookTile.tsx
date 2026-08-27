import pageArt from "../../assets/Bible_Page_Art.jpg";
import Button from "../ui/Button";
import type { BibleBookSummary } from "./types";

interface BookTileProps {
  book: BibleBookSummary;
  active: boolean;
  loading: boolean;
  onSelect: () => void;
}

export default function BookTile({ book, active, loading, onSelect }: BookTileProps) {
  return (
    <Button
      unstyled
      className={`bible-book-tile${active ? " bible-book-tile--active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`Open ${book.title}`}
      disabled={loading}
    >
      <span className="bible-book" aria-hidden="true">
        <span className="bible-book__back" />
        <img className="bible-book__page bible-book__page--back" src={pageArt} alt="" />
        <img className="bible-book__page bible-book__page--front" src={pageArt} alt="" />
        <span className="bible-book__cover">
          <strong>KJV</strong>
          <span>{book.title}</span>
          <small>{loading ? "Loading…" : `${book.chapter_count} chapters`}</small>
        </span>
      </span>
      <span className="bible-book-tile__label">{book.title}</span>
    </Button>
  );
}
