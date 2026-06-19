import { Activity, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatCents } from "../../utils/money";
import { ContentFlatCard } from "./ContentFlatCard";

interface BalanceSheetCardProps {
  balance: number;
  totalCredits: number;
  totalDebits: number;
}

export const BalanceSheetCard = ({
	balance,
	totalCredits,
	totalDebits,
}: BalanceSheetCardProps) => (
	<ContentFlatCard>
    <h3
      style={{
        margin: "0 0 1.25rem 0",
        fontSize: "1.2rem",
        borderBottom: "1px solid var(--border-color)",
        paddingBottom: "0.75rem",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <Activity size={20} /> Balance Sheet
    </h3>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "0.5rem",
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <ArrowDownRight size={16} color="var(--color-success)" /> Total Credits
      </span>
      <span style={{ color: "var(--color-success)", fontWeight: "bold" }}>
        + {formatCents(totalCredits)}
      </span>
    </div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginBottom: "1rem",
        borderBottom: "1px solid var(--border-color)",
        paddingBottom: "1rem",
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <ArrowUpRight size={16} color="var(--text-primary)" /> Total Debits
      </span>
      <span style={{ color: "var(--text-primary)", fontWeight: "bold" }}>
        - {formatCents(totalDebits)}
      </span>
    </div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: "1.2rem",
        fontWeight: "bold",
      }}
    >
      <span>Net Balance</span>
      <span
        style={{
          color: balance >= 0 ? "var(--color-success)" : "var(--color-danger)",
        }}
      >
        {formatCents(balance)}
      </span>
    </div>
	</ContentFlatCard>
);
