import { ForumPageShell } from "../../components/forum/ForumPageShell";
import ViewThreadPage from "../../components/forum/thread-view/ViewThreadPage";

export default function ViewThreadRoute() {
  return (
    <ForumPageShell>
      <ViewThreadPage />
    </ForumPageShell>
  );
}
