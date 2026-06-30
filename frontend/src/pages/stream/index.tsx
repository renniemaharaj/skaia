import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { apiRequest } from "../../utils/api";

interface StreamMeta {
  id: string;
  route: string;
  title: string;
  description: string;
}

export default function StreamPage() {
  const { streamId } = useParams();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!streamId) {
        try {
          const created = await apiRequest<StreamMeta>("/stream-meta", { method: "POST" });
          if (alive) navigate(created.route, { replace: true });
        } catch (err) {
          if (alive) toast.error(err instanceof Error ? err.message : "Could not open stream");
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

  if (!streamId) {
    return null;
  }

  if (missing) {
    return (
      <main className="page-content">
        <h1>Stream unavailable</h1>
      </main>
    );
  }

  return (
    <main className="page-content">
      <h1>{meta?.title || "Live Stream"}</h1>
      {meta?.description ? <p>{meta.description}</p> : null}
    </main>
  );
}
