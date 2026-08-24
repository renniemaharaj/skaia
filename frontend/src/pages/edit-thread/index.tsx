import EditThread from "../../components/forum/EditThread";
import { ForumPageShell } from "../../components/forum/ForumPageShell";
import { useParams } from "react-router-dom";

const EditThreadPage = () => {
  const { threadId } = useParams<{ threadId: string }>();
  return (
    <ForumPageShell
      backTo={threadId ? `/view-thread/${threadId}` : "/forum"}
      backLabel={threadId ? "Back to Thread" : "Back to Forum"}
    >
      <EditThread />
    </ForumPageShell>
  );
};

export default EditThreadPage;
