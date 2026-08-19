import { useAtomValue, useSetAtom } from "jotai";
import { CreditCard, DollarSign, Edit, LayoutDashboard, PlusCircle, Trash } from "lucide-react";
import React, { useCallback, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";
import { layoutModeAtom } from "../../atoms/layoutMode";
import { apiRequest } from "../../utils/api";
import { formatCents } from "../../utils/money";
import { getServerNow } from "../../utils/serverTime";
import { BalanceSheetCard } from "../cards/BalanceSheetCard";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { ContentStandOutCard } from "../cards/ContentStandOutCard";
import { TransactionHistoryCard } from "../cards/TransactionHistoryCard";
import { FormField, FormSelect, ManagedForm } from "../form";
import { confirmDestructiveAction } from "../ui/Prompt";
import { useUserData } from "../user/useUserData";
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
  card_number?: string;
  cvv?: string;
  last4?: string;
  expiry_month: number;
  expiry_year: number;
}

interface WalletResponse {
  balance?: number;
  transactions?: Transaction[];
}

interface WalletCardsResponse {
  cards?: UserCard[];
}

function cardLast4(card: UserCard) {
  return card.last4 || card.card_number?.slice(-4) || "XXXX";
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
        apiRequest<WalletResponse>(`/store/wallet${walletQueryString}`),
        apiRequest<WalletCardsResponse>(`/store/wallet/cards${walletQueryString}`),
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

  const handleSaveCard = async (
    values: typeof cardForm,
    helpers: { setStatus: (status?: string) => void }
  ) => {
    if (!canViewTargetWallet) return;
    helpers.setStatus(undefined);
    try {
      if (editingCard) {
        await apiRequest(`/store/wallet/cards/${editingCard.id}${walletQueryString}`, {
          method: "PUT",
          body: JSON.stringify(values),
        });
        toast.success("Card updated successfully!");
      } else {
        await apiRequest(`/store/wallet/cards${walletQueryString}`, {
          method: "POST",
          body: JSON.stringify(values),
        });
        toast.success("Card added successfully!");
      }
      setShowCardForm(false);
      setEditingCard(null);
      fetchData();
    } catch (err) {
      helpers.setStatus(err instanceof Error ? err.message : "Failed to save card");
      toast.error("Failed to save card");
    }
  };

  const handleDeleteCard = async (id: number) => {
    if (!canViewTargetWallet) return;
    if (
      !(await confirmDestructiveAction({
        title: "Delete payment card?",
        body: "The saved card record will move to Trash and can be restored by an authorized user.",
        confirmLabel: "Delete card",
      }))
    )
      return;
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
      card_number: "",
      cvv: "",
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
        <ContentFlatCard className="wallet-page__notice">
          You need store management permission to view another user's wallet session.
        </ContentFlatCard>
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
          <ContentStandOutCard className="card--store" style={{ textAlign: "center" }}>
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
                type="button"
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
          </ContentStandOutCard>

          {/* User Cards Tile */}
          <ContentFlatCard>
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
              <button
                type="button"
                className="btn-admin-icon"
                onClick={openAddCard}
                title="Add New Card"
              >
                <PlusCircle size={24} />
              </button>
            </div>

            {showCardForm ? (
              <ManagedForm
                id="wallet-card-form"
                title={editingCard ? "Edit payment card" : "Add payment card"}
                eyebrow="Wallet"
                description="Payment details are stored privately for this wallet."
                initialValues={cardForm}
                enableReinitialize
                onCancel={() => setShowCardForm(false)}
                submitLabel={editingCard ? "Update card" : "Save card"}
                submitDisabled={formik =>
                  !formik.values.card_name.trim() ||
                  (!editingCard && !formik.values.card_number.trim())
                }
                onSubmit={handleSaveCard}
              >
                <FormField
                  name="card_name"
                  label="Card name"
                  help="A private label such as Personal Visa."
                  required
                />
                <FormField
                  name="card_description"
                  label="Description"
                  placeholder="Optional note"
                />
                <div className="managed-form__grid">
                  <FormSelect
                    name="card_type"
                    label="Card network"
                    block
                    options={[
                      { value: "visa", label: "Visa" },
                      { value: "mastercard", label: "Mastercard" },
                      { value: "amex", label: "Amex" },
                      { value: "discover", label: "Discover" },
                    ]}
                  />
                  <FormSelect
                    name="is_credit"
                    label="Card type"
                    block
                    parseValue={value => value === "true"}
                    options={[
                      { value: "false", label: "Debit" },
                      { value: "true", label: "Credit" },
                    ]}
                  />
                </div>
                <FormField
                  name="card_number"
                  label="Card number"
                  help={editingCard ? "Leave blank to keep the saved number." : undefined}
                  inputMode="numeric"
                  autoComplete="cc-number"
                  required={!editingCard}
                />
                <div className="managed-form__grid">
                  <FormField
                    name="expiry_month"
                    label="Expiry month"
                    type="number"
                    min="1"
                    max="12"
                    required
                  />
                  <FormField
                    name="expiry_year"
                    label="Expiry year"
                    type="number"
                    min="2020"
                    max="2050"
                    required
                  />
                  <FormField
                    name="cvv"
                    label="Security code"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    required={!editingCard}
                  />
                </div>
              </ManagedForm>
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
                          •••• •••• •••• {cardLast4(card)}{" "}
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
                          type="button"
                          className="btn-admin-icon"
                          onClick={() => openEditCard(card)}
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          type="button"
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
          </ContentFlatCard>
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
