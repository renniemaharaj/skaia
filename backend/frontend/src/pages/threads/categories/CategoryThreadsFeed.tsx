import type { FeedThread } from "../../../hooks/useThreadsFeed";
import ThreadsFeed from "../../../components/forum/ThreadsFeed";

interface Props {
  threads: FeedThread[];
  isLoading: boolean;
  loading: boolean;
  feedRef: React.RefObject<HTMLDivElement | null>;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
}

const CategoryThreadsFeed = ({
  threads,
  isLoading,
  loading,
  feedRef,
  sentinelRef,
  handleScroll,
}: Props) => {
  return (
    <ThreadsFeed
      threads={threads}
      isLoading={isLoading}
      loading={loading}
      feedRef={feedRef}
      sentinelRef={sentinelRef}
      handleScroll={handleScroll}
      emptyMessage="No threads in this category yet."
    />
  );
};

export default CategoryThreadsFeed;
