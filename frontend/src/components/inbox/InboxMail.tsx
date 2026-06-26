import { useAtom, useSetAtom } from "jotai";
import { Mail } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  type InboxConversation,
  inboxConversationsAtom,
  inboxUnreadCountAtom,
} from "../../atoms/inbox";
import { apiRequest } from "../../utils/api";

const InboxMail = ({ setMenuOpen }: { setMenuOpen: (v: boolean) => void }) => {
  const setInboxConversations = useSetAtom(inboxConversationsAtom);
  const [inboxUnreadCount, setInboxUnreadCount] = useAtom(inboxUnreadCountAtom);

  // Load conversations on mount
  useEffect(() => {
    apiRequest<InboxConversation[]>("/inbox/conversations")
      .then(async data => {
        const convs = data ?? [];
        setInboxConversations(convs);
        // Compute total unread
        const total = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0);
        setInboxUnreadCount(total);
      })
      .catch(() => {});
  }, []);

  return (
    <Link
      to="/inbox"
      className={`header-inbox-btn${inboxUnreadCount > 0 ? " header-inbox-btn--unread" : ""}`}
      title="Messages"
      onClick={() => setMenuOpen(false)}
    >
      <Mail size={20} />
      {inboxUnreadCount > 0 && (
        <span className="header-inbox-badge">
          {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
        </span>
      )}
    </Link>
  );
};

export default InboxMail;
