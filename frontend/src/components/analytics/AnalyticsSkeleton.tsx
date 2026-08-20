import { X } from "lucide-react";
import { SkeletonPrimitive } from "../ui/Skeleton";
import "./AnalyticsSkeleton.css";

export function AnalyticsSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="analytics-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading analytics"
    >
      <div className="analytics-skeleton__panel">
        <header className="analytics-skeleton__header">
          <SkeletonPrimitive width="34%" height={18} />
          <button type="button" className="action-btn" onClick={onClose} title="Close analytics">
            <X size={16} />
          </button>
        </header>
        <div className="analytics-skeleton__tabs">
          <SkeletonPrimitive width={84} height={32} />
          <SkeletonPrimitive width={84} height={32} />
        </div>
        <div className="analytics-skeleton__body">
          <div className="analytics-skeleton__stats">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={`analytics-stat-${index}`}>
                <SkeletonPrimitive width="58%" height={24} />
                <SkeletonPrimitive width="72%" height={11} />
              </div>
            ))}
          </div>
          <SkeletonPrimitive className="analytics-skeleton__chart" />
        </div>
      </div>
    </div>
  );
}
