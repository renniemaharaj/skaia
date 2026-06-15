import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  size?: number;
  onChange?: (rating: number) => void;
  disabled?: boolean;
}

export default function StarRating({
  rating,
  maxRating = 5,
  size = 16,
  onChange,
  disabled = false,
}: StarRatingProps) {
  return (
    <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
      {Array.from({ length: maxRating }).map((_, index) => {
        const value = index + 1;
        const isFilled = value <= rating;
        return (
          <Star
            key={value}
            size={size}
            fill={isFilled ? "var(--primary-color)" : "transparent"}
            color={isFilled ? "var(--primary-color)" : "var(--text-secondary)"}
            style={{
              cursor: disabled || !onChange ? "default" : "pointer",
              transition: "transform 0.1s ease",
            }}
            onMouseEnter={(e) => {
              if (!disabled && onChange) {
                e.currentTarget.style.transform = "scale(1.1)";
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled && onChange) {
                e.currentTarget.style.transform = "scale(1)";
              }
            }}
            onClick={() => {
              if (!disabled && onChange) {
                onChange(value);
              }
            }}
          />
        );
      })}
    </div>
  );
}
