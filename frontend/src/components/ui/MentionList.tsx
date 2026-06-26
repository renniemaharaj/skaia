import { Loader2 } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { apiRequest } from "../../utils/api";
import "./Mentions.css";

export const MentionList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const query = props.items[0]?._query || "";

  useEffect(() => {
    let active = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest(`/users/mentions?q=${encodeURIComponent(query)}`);
        if (active) {
          if (Array.isArray(data)) {
            setItems(
              data.map((i: any) => ({ id: i.id, label: i.name, type: i.type, avatar: i.avatar }))
            );
          } else {
            setItems([]);
          }
          setSelectedIndex(0);
        }
      } catch (err) {
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) {
      props.command({ id: item.id, label: item.label, type: item.type });
    }
  };

  const upHandler = () => {
    if (items.length === 0) return;
    setSelectedIndex((selectedIndex + items.length - 1) % items.length);
  };

  const downHandler = () => {
    if (items.length === 0) return;
    setSelectedIndex((selectedIndex + 1) % items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }
      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }
      if (event.key === "Enter") {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="mention-dropdown">
      {loading ? (
        <div className="mention-loading">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : items.length ? (
        items.map((item: any, index: number) => (
          <button
            key={index}
            className={`mention-item ${index === selectedIndex ? "is-selected" : ""}`}
            onClick={() => selectItem(index)}
          >
            {item.avatar ? (
              <img src={item.avatar} alt={item.label} className="mention-item-avatar" />
            ) : item.type === "user" ? (
              <div className="mention-item-avatar-placeholder">
                {item.label?.[0]?.toUpperCase()}
              </div>
            ) : null}
            <span className="mention-item-label">{item.label}</span>
            {item.type && <span className="mention-item-type">{item.type}</span>}
          </button>
        ))
      ) : (
        <div className="mention-empty">No results</div>
      )}
    </div>
  );
});
