import React, { useCallback, useState, useEffect } from "react";
import { apiRequest } from "../../utils/api";
import { formatCents } from "../../utils/money";
import { CreditCard, Trash, Edit, PlusCircle, LayoutDashboard, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { useUserData } from "../user/useUserData";
import { useAtomValue, useSetAtom } from "jotai";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";
import { layoutModeAtom } from "../../atoms/layoutMode";
import { BalanceSheetCard } from "../cards/BalanceSheetCard";
import { TransactionHistoryCard } from "../cards/TransactionHistoryCard";
import { getServerNow } from "../../utils/serverTime";
import "./Store.css";
import { SecondaryCard } from "../cards/GlassCard";
import Select from "../input/Select";
import { StorePageShell } from "./StorePageShell";
import "./WalletPage.css";

interface Transaction {
  id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

interface UserCard {
  id: number;
  card_name: string;
  card_description: string;
  card_type: string;
  is_credit: boolean;
  card_number: string;
  cvv: string;
  expiry_month: number;
  expiry_year: number;
}

export const WalletPage = () => {
  const [searchParams] = useSearchParams();
  const targetUserId = searchParams.get("userId");
  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canManageStore = hasPermission("store.manageOrders");
  const hasViewer = Boolean(currentUser?.id);
  const isViewingOtherWallet = Boolean(
    targetUserId && hasViewer && String(targetUserId) !== String(currentUser?.id)
  );
  const requestedOtherWallet = Boolean(targetUserId && (!hasViewer || isViewingOtherWallet));
  const canViewTargetWallet = !requestedOtherWallet || canManageStore;
  const effectiveUserId = canViewTargetWallet ? targetUserId || currentUser?.id : currentUser?.id;
  const walletQueryString =
    canManageStore && isViewingOtherWallet && targetUserId
      ? `?user_id=${encodeURIComponent(targetUserId)}`
      : "";

  const { user: walletOwner } = useUserData(effectiveUserId, canManageStore);

  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [editingCard, setEditingCard] = useState<UserCard | null>(null);
  const [serverTime, setServerTime] = useState<Date>(() => new Date(getServerNow()));

  const [cardForm, setCardForm] = useState({
    card_name: "",
    card_description: "",
    card_type: "visa",
    is_credit: false,
    card_number: "",
    cvv: "",
    expiry_month: new Date().getMonth() + 1,
    expiry_year: new Date().getFullYear() + 1,
  });

  const setLayoutMode = useSetAtom(layoutModeAtom);

  useEffect(() => {
    setLayoutMode("application");
    return () => setLayoutMode("web");
  }, [setLayoutMode]);

  const hasFetched = React.useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setServerTime(new Date(getServerNow())), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
    if (!currentUser?.id || !canViewTargetWallet) {
      setBalance(0);
      setTransactions([]);
      setCards([]);
      hasFetched.current = false;
      return;
    }
    setLoading(true);
    try {
      const [walletData, cardsData] = await Promise.all([
        apiRequest(`/store/wallet${walletQueryString}`) as Promise<any>,
        apiRequest(`/store/wallet/cards${walletQueryString}`) as Promise<any>,
      ]);
      setBalance(walletData.balance || 0);
      setTransactions(walletData.transactions || []);
      setCards(cardsData.cards || []);
      hasFetched.current = true;
    } catch (err) {
      toast.error("Failed to fetch wallet info");
    } finally {
      setLoading(false);
    }
  }, [canViewTargetWallet, currentUser?.id, walletQueryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canViewTargetWallet) return;
    setLoading(true);
    try {
      if (editingCard) {
        await apiRequest(`/store/wallet/cards/${editingCard.id}${walletQueryString}`, {
          method: "PUT",
          body: JSON.stringify(cardForm),
        });
        toast.success("Card updated successfully!");
      } else {
        await apiRequest(`/store/wallet/cards${walletQueryString}`, {
          method: "POST",
          body: JSON.stringify(cardForm),
        });
        toast.success("Card added successfully!");
      }
      setShowCardForm(false);
      setEditingCard(null);
      fetchData();
    } catch (err) {
      toast.error("Failed to save card");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (id: number) => {
    if (!canViewTargetWallet) return;
    if (!confirm("Are you sure you want to delete this card?")) return;
    setLoading(true);
    try {
      await apiRequest(`/store/wallet/cards/${id}${walletQueryString}`, {
        method: "DELETE",
      });
      toast.success("Card deleted successfully!");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete card");
      setLoading(false);
    }
  };

  const openEditCard = (card: UserCard) => {
    setEditingCard(card);
    setCardForm({
      card_name: card.card_name,
      card_description: card.card_description,
      card_type: card.card_type,
      is_credit: card.is_credit,
      card_number: card.card_number,
      cvv: card.cvv,
      expiry_month: card.expiry_month,
      expiry_year: card.expiry_year,
    });
    setShowCardForm(true);
  };

  const openAddCard = () => {
    setEditingCard(null);
    setCardForm({
      card_name: "",
      card_description: "",
      card_type: "visa",
      is_credit: false,
      card_number: "",
      cvv: "",
      expiry_month: new Date().getMonth() + 1,
      expiry_year: new Date().getFullYear() + 1,
    });
    setShowCardForm(true);
  };

  const totalCredits = transactions
    .filter(t => t.type === "credit")
    .reduce((acc, t) => acc + t.amount, 0);
  const totalDebits = transactions
    .filter(t => t.type === "debit")
    .reduce((acc, t) => acc + t.amount, 0);

  const walletOwnerName = walletOwner?.display_name || walletOwner?.username || "Current user";
  const serverDate = serverTime.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const serverClock = serverTime.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  const shellMeta = (
    <>
      <span className="wallet-page__meta-item">
        <span className="wallet-page__meta-label">Owner</span>
        <strong>{walletOwnerName}</strong>
      </span>
      <span className="wallet-page__meta-item">
        <span className="wallet-page__meta-label">Server</span>
        <strong>
          {serverDate} {serverClock}
        </strong>
      </span>
    </>
  );

  if (!canViewTargetWallet) {
    return (
      <StorePageShell
        className="wallet-page"
        title={
          <span className="wallet-page__title">
            <LayoutDashboard size={24} />
            Wallet
          </span>
        }
        backTo="/store"
        backLabel="Exit Session"
        meta={shellMeta}
      >
        <SecondaryCard className="wallet-page__notice">
          You need store management permission to view another user's wallet session.
        </SecondaryCard>
      </StorePageShell>
    );
  }

  return (
    <StorePageShell
      className="wallet-page"
      title={
        <span className="wallet-page__title">
          <LayoutDashboard size={24} />
          Wallet
        </span>
      }
      backTo="/store"
      backLabel="Exit Session"
      meta={shellMeta}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.5rem",
        }}
      >
        {/* Left Side: Balance & Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Balance Tile */}
          <div className="card card--store" style={{ padding: "1.5rem", textAlign: "center" }}>
            <p
              style={{
                color: "var(--text-secondary)",
                margin: "0 0 0.5rem 0",
                fontSize: "1rem",
              }}
            >
              Current Balance
            </p>
            <h1
              style={{
                margin: "0 0 1.25rem 0",
                fontSize: "3rem",
                color: "var(--text-primary)",
              }}
            >
              {formatCents(balance)}
            </h1>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                className="btn btn-ghost"
                style={{
                  padding: "0.4rem 1.5rem",
                  fontSize: "1rem",
                  opacity: 0.5,
                }}
                disabled
              >
                <DollarSign size={18} style={{ marginRight: "8px" }} /> Add Funds
              </button>
            </div>
          </div>

          {/* User Cards Tile */}
          <SecondaryCard style={{ padding: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.3rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <CreditCard size={20} /> Payment Cards
              </h3>
              <button className="btn-admin-icon" onClick={openAddCard} title="Add New Card">
                <PlusCircle size={24} />
              </button>
            </div>

            {showCardForm ? (
              <form
                onSubmit={handleSaveCard}
                style={{
                  background: "var(--bg-primary)",
                  padding: "1rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div style={{ display: "grid", gap: "1rem" }}>
                  <input
                    className="input-group input"
                    type="text"
                    placeholder="Card Name (e.g. Personal Visa)"
                    value={cardForm.card_name}
                    onChange={e => setCardForm({ ...cardForm, card_name: e.target.value })}
                    required
                  />
                  <input
                    className="input-group input"
                    type="text"
                    placeholder="Description"
                    value={cardForm.card_description}
                    onChange={e =>
                      setCardForm({
                        ...cardForm,
                        card_description: e.target.value,
                      })
                    }
                  />

                  <div style={{ display: "flex", gap: "1rem" }}>
                    <Select
                      className="input-group input"
                      style={{ flex: 1 }}
                      value={cardForm.card_type}
                      options={[
                        { value: "visa", label: "Visa" },
                        { value: "mastercard", label: "Mastercard" },
                        { value: "amex", label: "Amex" },
                        { value: "discover", label: "Discover" },
                      ]}
                      onChange={e =>
                        setCardForm({
                          ...cardForm,
                          card_type: e.target.value,
                        })
                      }
                    />
                    <Select
                      className="input-group input"
                      style={{ flex: 1 }}
                      value={cardForm.is_credit ? "true" : "false"}
                      options={[
                        { value: "false", label: "Debit" },
                        { value: "true", label: "Credit" },
                      ]}
                      onChange={e =>
                        setCardForm({
                          ...cardForm,
                          is_credit: e.target.value === "true",
                        })
                      }
                    />
                  </div>

                  <input
                    className="input-group input"
                    type="text"
                    placeholder="Card Number"
                    value={cardForm.card_number}
                    onChange={e =>
                      setCardForm({
                        ...cardForm,
                        card_number: e.target.value,
                      })
                    }
                    required
                  />
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <input
                      className="input-group input"
                      type="number"
                      min="1"
                      max="12"
                      placeholder="MM"
                      value={cardForm.expiry_month}
                      onChange={e =>
                        setCardForm({
                          ...cardForm,
                          expiry_month: parseInt(e.target.value) || 1,
                        })
                      }
                      required
                      style={{ flex: 1 }}
                    />
                    <input
                      className="input-group input"
                      type="number"
                      min="2020"
                      max="2050"
                      placeholder="YYYY"
                      value={cardForm.expiry_year}
                      onChange={e =>
                        setCardForm({
                          ...cardForm,
                          expiry_year: parseInt(e.target.value) || 2024,
                        })
                      }
                      required
                      style={{ flex: 1 }}
                    />
                    <input
                      className="input-group input"
                      type="text"
                      placeholder="CVV"
                      value={cardForm.cvv}
                      onChange={e => setCardForm({ ...cardForm, cvv: e.target.value })}
                      required
                      style={{ flex: 1 }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={loading}
                    >
                      {editingCard ? "Update" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                      onClick={() => setShowCardForm(false)}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {cards.length === 0 ? (
                  <div
                    style={{
                      opacity: 0.5,
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                      pointerEvents: "none",
                    }}
                  >
                    {[1, 2].map(i => (
                      <div
                        key={`skel-card-${i}`}
                        style={{
                          padding: "1rem",
                          background: "var(--bg-primary)",
                          borderRadius: "8px",
                          border: "1px dashed var(--border-color)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              height: "18px",
                              background: "var(--border-color)",
                              width: "40%",
                              borderRadius: "4px",
                              marginBottom: "8px",
                            }}
                          />
                          <div
                            style={{
                              height: "14px",
                              background: "var(--border-color)",
                              width: "60%",
                              borderRadius: "4px",
                              marginBottom: "8px",
                            }}
                          />
                          <div
                            style={{
                              height: "16px",
                              background: "var(--border-color)",
                              width: "50%",
                              borderRadius: "4px",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            background: "var(--border-color)",
                            borderRadius: "50%",
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  cards.map(card => (
                    <div
                      key={card.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "1rem",
                        background: "var(--bg-primary)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            marginBottom: "4px",
                          }}
                        >
                          <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>
                            {card.card_name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "2px 6px",
                              background: "var(--bg-secondary)",
                              borderRadius: "4px",
                              border: "1px solid var(--border-color)",
                              textTransform: "uppercase",
                            }}
                          >
                            {card.card_type} {card.is_credit ? "Credit" : "Debit"}
                          </span>
                        </div>
                        <p
                          style={{
                            margin: "0 0 4px 0",
                            color: "var(--text-secondary)",
                            fontSize: "0.9rem",
                          }}
                        >
                          {card.card_description}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: "monospace",
                            fontSize: "1rem",
                          }}
                        >
                          •••• •••• •••• {card.card_number.slice(-4) || "XXXX"}{" "}
                          <span
                            style={{
                              fontSize: "0.8rem",
                              color: "var(--text-secondary)",
                              marginLeft: "8px",
                            }}
                          >
                            Exp: {card.expiry_month}/{card.expiry_year}
                          </span>
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="btn-admin-icon"
                          onClick={() => openEditCard(card)}
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          className="btn-admin-icon"
                          onClick={() => handleDeleteCard(card.id)}
                          title="Delete"
                          style={{ color: "var(--color-danger)" }}
                        >
                          <Trash size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </SecondaryCard>
        </div>

        {/* Right Side: Transactions & Balance Sheet */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <BalanceSheetCard
            balance={balance}
            totalCredits={totalCredits}
            totalDebits={totalDebits}
          />

          <TransactionHistoryCard
            loading={loading}
            transactions={transactions}
            hasFetched={hasFetched.current}
          />
        </div>
      </div>
    </StorePageShell>
  );
};
