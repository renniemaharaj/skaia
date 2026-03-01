import { Forum } from "../../components/Forum";

export const ForumPage = () => {
  const handleThreadCreate = (thread: { title: string; content: string }) => {
    console.log("Thread created:", thread);
    // TODO: Connect to actual backend
  };

  const handleThreadDelete = (id: string) => {
    console.log("Thread deleted:", id);
    // TODO: Connect to actual backend
  };

  const handleThreadUpdate = (
    id: string,
    thread: { title: string; content: string },
  ) => {
    console.log("Thread updated:", id, thread);
    // TODO: Connect to actual backend
  };

  return (
    <Forum
      onThreadCreate={handleThreadCreate}
      onThreadDelete={handleThreadDelete}
      onThreadUpdate={handleThreadUpdate}
    />
  );
};
