import type { FeedThread } from "../../hooks/useThreadsFeed";
import ThreadsFeed from "./ThreadsFeed";

interface Props {
  threads: FeedThread[];
  isLoading: boolean;
  loading: boolean;
  feedRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  emptyMessage?: string;
}

const CategoryThreadsFeed = ({
  threads,
  isLoading,
  loading,
  feedRef,
  sentinelRef,
  handleScroll,
  emptyMessage = "No threads in this category yet.",
}: Props) => {
  return (
    <ThreadsFeed
      threads={threads}
      isLoading={isLoading}
      loading={loading}
      feedRef={feedRef}
      sentinelRef={sentinelRef}
      handleScroll={handleScroll}
      emptyMessage={emptyMessage}
    />
  );
};

export default CategoryThreadsFeed;
