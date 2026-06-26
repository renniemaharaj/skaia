import { formatCents } from "../../utils/money";

interface MoneyAmountProps {
  cents: number;
  className?: string;
  currency?: string;
}

export function MoneyAmount({ cents, className, currency = "USD" }: MoneyAmountProps) {
  return (
    <span className={["money-amount", className].filter(Boolean).join(" ")}>
      <span className="money-amount__value">{formatCents(cents)}</span>
      <span className="money-amount__currency">{currency}</span>
    </span>
  );
}
