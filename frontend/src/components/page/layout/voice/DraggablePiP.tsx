import { useEffect, useRef, useState } from "react";
import { RemoteMedia } from "./RemoteMedia";

export const DraggablePiP = ({ stream }: { stream: MediaStream }) => {
  const [pos, setPos] = useState({ right: 24, bottom: 64 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    initialRight: 0,
    initialBottom: 0,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialRight: pos.right,
      initialBottom: pos.bottom,
    };
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPos({
        right: Math.max(0, dragRef.current.initialRight - dx),
        bottom: Math.max(0, dragRef.current.initialBottom - dy),
      });
    };
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  return (
    <div
      style={{
        position: "absolute",
        right: pos.right,
        bottom: pos.bottom,
        width: "240px",
        height: "180px",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.2)",
        backgroundColor: "#000",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        cursor: dragging ? "grabbing" : "grab",
        zIndex: 50,
      }}
      onMouseDown={handleMouseDown}
    >
      <RemoteMedia stream={stream} volume={0} objectFit="cover" />
    </div>
  );
};
