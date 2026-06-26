import type React from "react";
import { useRef } from "react";
import "./SpotlightCard.css";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  spotlightColor?: string;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = "",
  spotlightColor = "var(--primary-color, rgba(255, 255, 255, 0.25))",
  style = {},
  onMouseMove,
  ...props
}) => {
  const divRef = useRef<HTMLDivElement>(null);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = e => {
    onMouseMove?.(e);
    if (!divRef.current) return;

    const rect = divRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    divRef.current.style.setProperty("--mouse-x", `${x}px`);
    divRef.current.style.setProperty("--mouse-y", `${y}px`);
    divRef.current.style.setProperty("--spotlight-color", spotlightColor);
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      className={`card-spotlight ${className}`}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
};

export default SpotlightCard;
