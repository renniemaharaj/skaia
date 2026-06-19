import { Activity, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatCents } from "../../utils/money";
import { ContentFlatCard } from "./ContentFlatCard";

interface BalanceSheetCardProps {
  balance: number;
  totalCredits?: number;
  totalDebits?: number;
  title?: string;
  totalLabel?: string;
  lines?: Array<{
    label: string;
    detail?: string;
    amount: number;
  }>;
  className?: string;
}

export const BalanceSheetCard = ({
  balance,
  totalCredits,
  totalDebits,
  title = "Balance Sheet",
  totalLabel = "Net Balance",
  lines,
  className,
}: BalanceSheetCardProps) => (
  <ContentFlatCard className={className}>
    <h3
      style={{
        margin: "0 0 0.5rem",
        fontSize: "0.95rem",
        borderBottom: "1px solid var(--border-color)",
        paddingBottom: "0.4rem",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <Activity size={18} /> {title}
    </h3>
    {lines?.map(line => (
      <div
        key={`${line.label}-${line.detail ?? ""}`}
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.35rem 0",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ color: "var(--text-primary)" }}>{line.label}</span>
          {line.detail && <small style={{ color: "var(--text-secondary)" }}>{line.detail}</small>}
        </span>
        <strong style={{ whiteSpace: "nowrap" }}>{formatCents(line.amount)}</strong>
      </div>
    ))}
    {totalCredits !== undefined && (
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
    )}
    {totalDebits !== undefined && (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: "0.5rem",
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
    )}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: "1rem",
        fontWeight: "bold",
      }}
    >
      <span>{totalLabel}</span>
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
