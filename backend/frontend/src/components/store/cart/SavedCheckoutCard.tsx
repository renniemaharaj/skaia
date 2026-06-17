import { ContentFlatCard } from "../../cards/ContentFlatCard";

interface SavedCheckoutCardProps {
  details: string[] | null;
  onUseSavedCheckout: () => void;
}

export function SavedCheckoutCard({ details, onUseSavedCheckout }: SavedCheckoutCardProps) {
  return (
    <ContentFlatCard className="saved-checkout-card">
      <div className="saved-checkout-header">
        <strong>Saved billing information</strong>
        <button className="btn btn-ghost" type="button" onClick={onUseSavedCheckout}>
          Use
        </button>
      </div>
      {details && (
        <div className="saved-checkout-details">
          {details.map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
        </div>
      )}
    </ContentFlatCard>
  );
}
