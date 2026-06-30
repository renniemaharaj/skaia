import { useAtomValue, useSetAtom } from "jotai";
import { RotateCcw, VideoOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  onlineUsersAtom,
  presenceActiveTabAtom,
  presencePanelExpandedAtom,
} from "../../atoms/presence";
import { streamRoutePlaybackAtom } from "../../atoms/voice";
import { ContentFlatCard } from "../../components/cards/ContentFlatCard";
import Button from "../../components/input/Button";
import { apiRequest } from "../../utils/api";
import { normalizeRoute } from "../../utils/route";
import "./StreamPage.css";

interface StreamMeta {
  id: string;
  route: string;
  owner_id?: number;
  title: string;
  description: string;
}

type StreamState = "loading" | "not-started" | "ended" | "retry";

export default function StreamPage() {
  const { streamId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const onlineUsers = useAtomValue(onlineUsersAtom);
  const playback = useAtomValue(streamRoutePlaybackAtom);
  const setPresenceExpanded = useSetAtom(presencePanelExpandedAtom);
  const setPresenceActiveTab = useSetAtom(presenceActiveTabAtom);

  const openVoicePanel = useCallback(() => {
    setPresenceExpanded(true);
    setPresenceActiveTab("voice");
    window.dispatchEvent(new CustomEvent("stream:retry-open"));
  }, [setPresenceActiveTab, setPresenceExpanded]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setMeta(null);
      setMissing(false);
      setCreateFailed(false);

      if (!streamId) {
        try {
          const created = await apiRequest<StreamMeta>("/stream-meta", {
            method: "POST",
          });
          if (alive) navigate(created.route, { replace: true });
        } catch (err) {
          if (!alive) return;
          setCreateFailed(true);
          toast.error(err instanceof Error ? err.message : "Could not open stream");
        }
        return;
      }

      try {
        const existing = await apiRequest<StreamMeta>(`/stream-meta/${streamId}`);
        if (alive) setMeta(existing);
      } catch {
        if (alive) setMissing(true);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [navigate, streamId]);

  const ownerIsHere = useMemo(() => {
    if (!meta?.owner_id) return false;
    const route = normalizeRoute(meta.route || location.pathname);
    return onlineUsers.some(
      user => user.user_id === meta.owner_id && normalizeRoute(user.route) === route
    );
  }, [location.pathname, meta, onlineUsers]);

  const state: StreamState = useMemo(() => {
    if (missing) return "ended";
    if (!meta) return "loading";
    if (playback.route === location.pathname && playback.activeVideoCount > 0) return "retry";
    return ownerIsHere ? "not-started" : "ended";
  }, [location.pathname, meta, missing, ownerIsHere, playback]);

  if (!streamId) {
    return createFailed ? (
      <StreamStatusScreen state="retry" onRetry={() => window.location.reload()} />
    ) : null;
  }

  return <StreamStatusScreen state={state} onRetry={openVoicePanel} />;
}

function StreamStatusScreen({
  state,
  onRetry,
}: {
  state: StreamState;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return <main className="stream-status" aria-label="Loading stream" />;
  }

  const copy = {
    "not-started": "Waiting for a participant to start the stream",
    ended: "Stream has ended",
    retry: "Couldn't start the stream automatically. Please retry.",
  } satisfies Record<Exclude<StreamState, "loading">, string>;

  return (
    <main className="stream-status">
      <ContentFlatCard className="stream-status__panel" aria-live="polite">
        <div className="stream-status__icon-wrap">
          <VideoOff size={48} strokeWidth={1.5} opacity={0.5} />
        </div>
        <h1>{copy[state]}</h1>
        {state === "retry" && (
          <Button onClick={onRetry} iconLeft={<RotateCcw size={16} />}>
            Retry
          </Button>
        )}
      </ContentFlatCard>
    </main>
  );
}
