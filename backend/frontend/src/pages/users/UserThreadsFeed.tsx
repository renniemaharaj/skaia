import { MessageSquare } from "lucide-react";
import type { FeedThread } from "../../hooks/useThreadsFeed";
import ThreadsFeed from "../../components/forum/ThreadsFeed";

interface Props {
  displayName: string;
  threads: FeedThread[];
  isLoading: boolean;
  loading: boolean;
  feedRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
}

const UserThreadsFeed = ({
  displayName,
  threads,
  isLoading,
  loading,
  feedRef,
  sentinelRef,
  handleScroll,
}: Props) => {
  return (
    <div className="up-threads-section">
      <h2 className="up-section-heading">
        <MessageSquare size={18} />
        Threads by {displayName}
      </h2>

      <ThreadsFeed
        threads={threads}
        isLoading={isLoading}
        loading={loading}
        feedRef={feedRef}
        sentinelRef={sentinelRef}
        handleScroll={handleScroll}
        showAuthor={false}
        emptyMessage="No threads posted yet."
      />
    </div>
  );
};

export default UserThreadsFeed;
