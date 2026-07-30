import {
  BookOpen,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Download,
  FolderHeart,
  HeartPlus,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../input/Button";
import Select from "../input/Select";
import BibleBrowser from "./BibleBrowser";
import BibleDialog from "./BibleDialog";
import { adjacentBibleSelection, bibleVerseSlice } from "./navigation";
import type {
  BibleBook,
  BibleBookSummary,
  BibleCatalog,
  BibleFavorite,
  BiblePreferences,
  BibleSelection,
} from "./types";
import { useBibleSpeech } from "./useBibleSpeech";

interface BibleReaderProps {
  catalog: BibleCatalog;
  book: BibleBook;
  selection: BibleSelection;
  preferences: BiblePreferences;
  loadingBookSlug: string;
  onSelectionChange: (selection: BibleSelection, options?: { replace?: boolean }) => void;
  onSelectBook: (book: BibleBookSummary) => void;
  onPreferencesChange: (update: (current: BiblePreferences) => BiblePreferences) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='menu']")
  );
}

function favoriteKey(selection: BibleSelection): string {
  return `${selection.bookSlug}:${selection.chapter}:${selection.verse}`;
}

export default function BibleReader({
  catalog,
  book,
  selection,
  preferences,
  loadingBookSlug,
  onSelectionChange,
  onSelectBook,
  onPreferencesChange,
}: BibleReaderProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const currentText = book.chapters[selection.chapter]?.[selection.verse] ?? "";
  const currentSlice = useMemo(() => bibleVerseSlice(book, selection, 5), [book, selection]);
  const previousSelection = useMemo(
    () => adjacentBibleSelection(book, selection, -1),
    [book, selection]
  );
  const nextSelection = useMemo(
    () => adjacentBibleSelection(book, selection, 1),
    [book, selection]
  );
  const nextFiveSelection = useMemo(
    () => adjacentBibleSelection(book, selection, 5),
    [book, selection]
  );

  const advanceNarration = useCallback(() => {
    const next = adjacentBibleSelection(book, selection, 1);
    if (!next) return false;
    onSelectionChange(next, { replace: true });
    return true;
  }, [book, onSelectionChange, selection]);

  const speech = useBibleSpeech({
    text: currentText,
    utteranceKey: `${book.slug}:${selection.chapter}:${selection.verse}`,
    scopeKey: book.slug,
    voiceURI: preferences.selectedVoiceURI,
    active: selection.isOpen && preferences.speechEnabled,
    onAdvance: advanceNarration,
  });

  useEffect(() => {
    if (!speech.voices.length || !speech.resolvedVoiceURI) return;
    if (speech.resolvedVoiceURI === preferences.selectedVoiceURI) return;
    onPreferencesChange(current => ({
      ...current,
      selectedVoiceURI: speech.resolvedVoiceURI,
    }));
  }, [
    onPreferencesChange,
    preferences.selectedVoiceURI,
    speech.resolvedVoiceURI,
    speech.voices.length,
  ]);

  const setSpeechEnabled = useCallback(
    (enabled: boolean) => {
      onPreferencesChange(current => ({ ...current, speechEnabled: enabled }));
    },
    [onPreferencesChange]
  );

  const move = useCallback(
    (offset: number, replace = false) => {
      const next = adjacentBibleSelection(book, selection, offset);
      if (next) onSelectionChange(next, { replace });
    },
    [book, onSelectionChange, selection]
  );

  const enterFullscreen = useCallback(() => {
    if (!selection.isOpen) {
      onSelectionChange({ ...selection, isOpen: true });
    }
    setIsFullscreen(true);
  }, [onSelectionChange, selection]);

  const leaveFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  const toggleReader = useCallback(() => {
    if (selection.isOpen && isFullscreen) leaveFullscreen();
    onSelectionChange({ ...selection, isOpen: !selection.isOpen });
  }, [isFullscreen, leaveFullscreen, onSelectionChange, selection]);

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!selection.isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullscreen && !pickerOpen && !favoritesOpen) {
        event.preventDefault();
        leaveFullscreen();
        return;
      }
      if (isTypingTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") {
        if (previousSelection) {
          event.preventDefault();
          move(-1);
        }
      } else if (event.key === "ArrowRight") {
        if (nextSelection) {
          event.preventDefault();
          move(1);
        }
      } else if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        setSpeechEnabled(!preferences.speechEnabled);
      } else if (event.key === " " && preferences.speechEnabled && speech.supported) {
        event.preventDefault();
        speech.togglePlayPause();
      } else if (event.key === "Escape" && speech.state !== "idle") {
        event.preventDefault();
        speech.stop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    move,
    nextSelection,
    favoritesOpen,
    pickerOpen,
    preferences.speechEnabled,
    previousSelection,
    isFullscreen,
    leaveFullscreen,
    selection.isOpen,
    setSpeechEnabled,
    speech,
  ]);

  const chapterOptions = useMemo(
    () =>
      Object.keys(book.chapters)
        .sort((a, b) => Number(a) - Number(b))
        .map(chapter => ({ value: chapter, label: `Chapter ${chapter}` })),
    [book.chapters]
  );
  const verseOptions = useMemo(
    () =>
      Object.keys(book.chapters[selection.chapter] ?? {})
        .sort((a, b) => Number(a) - Number(b))
        .map(verse => ({ value: verse, label: `Verse ${verse}` })),
    [book.chapters, selection.chapter]
  );

  const isFavorite = preferences.favorites.some(
    favorite => favoriteKey(favorite) === favoriteKey(selection)
  );

  const addFavorite = () => {
    if (isFavorite) return;
    const favorite: BibleFavorite = {
      ...selection,
      title: `${book.title} ${selection.chapter}:${selection.verse}`,
      bookTitle: book.title,
    };
    onPreferencesChange(current => ({
      ...current,
      favorites: [...current.favorites, favorite],
    }));
  };

  const removeFavorite = (favorite: BibleFavorite) => {
    onPreferencesChange(current => ({
      ...current,
      favorites: current.favorites.filter(item => favoriteKey(item) !== favoriteKey(favorite)),
    }));
  };

  const downloadBook = () => {
    const blob = new Blob([JSON.stringify(book, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${book.title}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const voiceOptions = speech.voices.map(voice => ({
    value: voice.voiceURI,
    label: `${voice.name} (${voice.lang})`,
  }));

  return (
    <>
      <section
        className={`bible-reader section${selection.isOpen ? " bible-reader--open" : ""}${
          isFullscreen ? " bible-reader--fullscreen" : ""
        }`}
        aria-label="Bible reader"
      >
        <div className="bible-reader__toolbar">
          <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
            {book.title}
          </Button>
          <span className="bible-reader__reference">
            {selection.chapter}:{selection.verse}
          </span>
          <div className="bible-reader__toolbar-actions">
            <Button
              size="icon"
              variant="action"
              onClick={toggleReader}
              aria-label={selection.isOpen ? "Close Bible reader" : "Open Bible reader"}
              title={selection.isOpen ? "Close reader" : "Open reader"}
            >
              {selection.isOpen ? <BookOpenCheck size={18} /> : <BookOpen size={18} />}
            </Button>
            <Button
              size="icon"
              variant={preferences.speechEnabled ? "primary" : "action"}
              onClick={() => setSpeechEnabled(!preferences.speechEnabled)}
              aria-label={preferences.speechEnabled ? "Disable narration" : "Enable narration"}
              title="Toggle narration (V)"
            >
              {preferences.speechEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </Button>
            <Button
              size="icon"
              variant="action"
              onClick={downloadBook}
              aria-label={`Download ${book.title} JSON`}
              title="Download book JSON"
            >
              <Download size={18} />
            </Button>
            <Button
              size="icon"
              variant="action"
              onClick={() => setFavoritesOpen(true)}
              aria-label="Open Bible favorites"
              title="Favorites"
            >
              <FolderHeart size={18} />
            </Button>
            <Button
              size="icon"
              variant={isFullscreen ? "primary" : "action"}
              onClick={isFullscreen ? leaveFullscreen : enterFullscreen}
              aria-label={
                isFullscreen ? "Exit fullscreen Bible reader" : "Enter fullscreen Bible reader"
              }
              aria-pressed={isFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen reader"}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </Button>
          </div>
        </div>

        {selection.isOpen && (
          <div className="bible-reader__body">
            <div className="bible-reader__selectors">
              <Select
                size="sm"
                aria-label="Bible chapter"
                value={selection.chapter}
                options={chapterOptions}
                onChange={event =>
                  onSelectionChange({
                    ...selection,
                    chapter: event.target.value,
                    verse: "1",
                  })
                }
              />
              <Select
                size="sm"
                aria-label="Bible verse"
                value={selection.verse}
                options={verseOptions}
                onChange={event => onSelectionChange({ ...selection, verse: event.target.value })}
              />
            </div>

            {preferences.speechEnabled && (
              <div className="bible-reader__speech" aria-label="Bible narration controls">
                {!speech.supported ? (
                  <p role="status">Browser narration is not available in this browser.</p>
                ) : (
                  <>
                    <Button
                      size="icon"
                      variant="action"
                      onClick={speech.togglePlayPause}
                      aria-label={speech.state === "playing" ? "Pause narration" : "Play narration"}
                      title={
                        speech.state === "playing"
                          ? "Pause narration (Space)"
                          : "Play narration (Space)"
                      }
                    >
                      {speech.state === "playing" ? <Pause size={18} /> : <Play size={18} />}
                    </Button>
                    <Button
                      size="icon"
                      variant="action"
                      disabled={speech.state === "idle"}
                      onClick={speech.stop}
                      aria-label="Stop narration"
                      title="Stop narration (Escape)"
                    >
                      <Square size={16} />
                    </Button>
                    {voiceOptions.length > 0 ? (
                      <Select
                        size="sm"
                        aria-label="Narration voice"
                        value={speech.resolvedVoiceURI}
                        options={voiceOptions}
                        truncateSelectedTo={34}
                        onChange={event =>
                          onPreferencesChange(current => ({
                            ...current,
                            selectedVoiceURI: event.target.value,
                          }))
                        }
                      />
                    ) : (
                      <span role="status">Loading browser voices…</span>
                    )}
                    <span className="bible-reader__speech-state" aria-live="polite">
                      {speech.state}
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="bible-reader__current-row">
              <Button
                size="icon"
                variant="action"
                disabled={!previousSelection}
                onClick={() => move(-1)}
                aria-label="Previous Bible verse"
                title="Previous verse (Left arrow)"
              >
                <ChevronLeft size={22} />
              </Button>
              <article className="bible-reader__current" aria-live="polite">
                <p className="bible-eyebrow">
                  {book.title} {selection.chapter}:{selection.verse}
                </p>
                <p>{currentText}</p>
              </article>
              <Button
                size="icon"
                variant="action"
                disabled={!nextSelection}
                onClick={() => move(1)}
                aria-label="Next Bible verse"
                title="Next verse (Right arrow)"
              >
                <ChevronRight size={22} />
              </Button>
            </div>

            <div className="bible-reader__context" aria-label="Current and following verses">
              {currentSlice.map((item, index) => (
                <p
                  key={`${item.chapter}:${item.verse}`}
                  className={index === 0 ? "is-current" : ""}
                >
                  <strong>
                    {item.chapter}:{item.verse}
                  </strong>{" "}
                  {item.text}
                </p>
              ))}
            </div>

            <div className="bible-reader__actions">
              <Button
                size="sm"
                variant="ghost"
                disabled={!nextFiveSelection}
                onClick={() => move(5)}
                iconLeft={<ChevronsRight size={17} />}
              >
                Next five
              </Button>
              <Button
                size="sm"
                variant={isFavorite ? "secondary" : "ghost"}
                disabled={isFavorite}
                onClick={addFavorite}
                iconLeft={<HeartPlus size={17} />}
              >
                {isFavorite ? "Favorited" : "Favorite"}
              </Button>
            </div>
          </div>
        )}
      </section>

      <BibleDialog
        open={pickerOpen}
        title="Holy Bible KJV"
        description="Choose a book to open in the reader."
        onClose={() => setPickerOpen(false)}
        className="bible-dialog--wide"
      >
        <BibleBrowser
          compact
          catalog={catalog}
          activeBookSlug={book.slug}
          loadingBookSlug={loadingBookSlug}
          onSelectBook={selectedBook => {
            onSelectBook(selectedBook);
            setPickerOpen(false);
          }}
        />
      </BibleDialog>

      <BibleDialog
        open={favoritesOpen}
        title="Bible favorites"
        description="Open or remove saved scripture references."
        onClose={() => setFavoritesOpen(false)}
      >
        {preferences.favorites.length === 0 ? (
          <div className="ui-empty">No Bible favorites yet.</div>
        ) : (
          <div className="bible-favorites">
            {preferences.favorites.map(favorite => (
              <div key={favoriteKey(favorite)} className="bible-favorite">
                <Button
                  variant="ghost"
                  onClick={() => {
                    onSelectionChange({
                      bookSlug: favorite.bookSlug,
                      chapter: favorite.chapter,
                      verse: favorite.verse,
                      isOpen: true,
                    });
                    setFavoritesOpen(false);
                  }}
                >
                  {favorite.title}
                </Button>
                <Button
                  size="icon"
                  variant="danger"
                  onClick={() => removeFavorite(favorite)}
                  aria-label={`Remove ${favorite.title} from favorites`}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </BibleDialog>
    </>
  );
}
