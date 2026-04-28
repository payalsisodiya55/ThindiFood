export const ADMIN_SIDEBAR_ACCESS_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "foods", label: "Foods" },
  { key: "categories", label: "Categories" },
  { key: "restaurants", label: "Restaurants" },
  { key: "zones", label: "Zones" },
  { key: "orders", label: "Orders" },
  { key: "promotions", label: "Promotions" },
  { key: "customers", label: "Customers" },
  { key: "support", label: "Support" },
  { key: "reports", label: "Reports" },
  { key: "transactions", label: "Transactions" },
  { key: "dining", label: "Dining" },
  { key: "settings", label: "Settings" },
  { key: "pages", label: "Pages & Policies" },
]

export const ADMIN_ACCESS_LABEL_MAP = Object.fromEntries(
  ADMIN_SIDEBAR_ACCESS_OPTIONS.map((item) => [item.key, item.label])
)
