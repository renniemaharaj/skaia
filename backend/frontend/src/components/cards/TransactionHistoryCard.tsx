import { FileText, Loader } from "lucide-react";
import { formatCents } from "../../utils/money";
import { GlassCard } from "./GlassCard";

interface Transaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

interface TransactionHistoryCardProps {
  loading: boolean;
  transactions: Transaction[];
  hasFetched: boolean;
}

export const TransactionHistoryCard = ({
  loading,
  transactions,
  hasFetched,
}: TransactionHistoryCardProps) => (
  <GlassCard
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
    }}
  >
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
      <FileText size={20} /> Transaction History
    </h3>

    {loading && !hasFetched ? (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <Loader className="spin" />
      </div>
    ) : transactions.length > 0 ? (
      <div
        style={{
          maxHeight: "500px",
          overflowY: "auto",
          paddingRight: "4px",
        }}
      >
        {transactions.map(tx => (
          <div
            key={tx.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem",
              borderBottom: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              borderRadius: "8px",
              marginBottom: "8px",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: "600",
                  fontSize: "1rem",
                }}
              >
                {tx.description}
              </p>
              <p
                style={{
                  margin: "4px 0 0 0",
                  fontSize: "0.85rem",
                  color: "var(--text-secondary)",
                }}
              >
                {new Date(tx.created_at).toLocaleString()}
              </p>
            </div>
            <div
              style={{
                fontWeight: "bold",
                fontSize: "1.15rem",
                color: tx.type === "credit" ? "var(--color-success)" : "var(--text-primary)",
              }}
            >
              {tx.type === "credit" ? "+" : "-"}
              {formatCents(tx.amount)}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div style={{ opacity: 0.5, pointerEvents: "none" }}>
        {[1, 2, 3].map(i => (
          <div
            key={`skel-tx-${i}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem",
              borderBottom: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              borderRadius: "8px",
              marginBottom: "8px",
              border: "1px dashed var(--border-color)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: "16px",
                  background: "var(--border-color)",
                  width: "50%",
                  borderRadius: "4px",
                  marginBottom: "8px",
                }}
              />
              <div
                style={{
                  height: "12px",
                  background: "var(--border-color)",
                  width: "30%",
                  borderRadius: "4px",
                }}
              />
            </div>
            <div
              style={{
                height: "20px",
                background: "var(--border-color)",
                width: "60px",
                borderRadius: "4px",
              }}
            />
          </div>
        ))}
      </div>
    )}
  </GlassCard>
);
