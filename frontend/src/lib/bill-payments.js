const STORAGE_KEY = "Nestora_bill_payments";

export function getBillPayments() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to read bill payments:", err);
    return [];
  }
}

export function addBillPayment({ category, summary, amount, tokenSymbol }) {
  if (typeof window === "undefined") return null;
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    summary,
    amount,
    tokenSymbol,
    status: "simulated",
    timestamp: Date.now(),
  };
  try {
    const existing = getBillPayments();
    const updated = [record, ...existing];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save bill payment:", err);
  }
  return record;
}
