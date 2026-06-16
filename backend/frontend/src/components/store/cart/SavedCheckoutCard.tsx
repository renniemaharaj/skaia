interface SavedCheckoutCardProps {
  details: string[] | null;
  onUseSavedCheckout: () => void;
}

export function SavedCheckoutCard({ details, onUseSavedCheckout }: SavedCheckoutCardProps) {
  return (
    <div className="saved-checkout-card card card--outlined">
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
    </div>
  );
}
