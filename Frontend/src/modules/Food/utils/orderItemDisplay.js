const getTrimmedText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

export const getOrderItemName = (item = {}) =>
  getTrimmedText(item?.name, item?.foodName, item?.title) || "Item";

export const getOrderItemQuantity = (item = {}) => {
  const quantity = Number(item?.quantity ?? item?.qty ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

export const getOrderItemVariantLabel = (item = {}) =>
  getTrimmedText(
    item?.variantName,
    item?.variant?.name,
    item?.selectedVariantName,
    item?.selectedVariant?.name,
    item?.portionName,
    item?.portion,
    item?.size,
    item?.sizeName,
    item?.variantLabel,
  );

export const formatOrderItemLabel = (
  item = {},
  { includeVariant = true, variantFormat = "paren" } = {},
) => {
  const name = getOrderItemName(item);
  const variantLabel = includeVariant ? getOrderItemVariantLabel(item) : "";

  if (!variantLabel) return name;
  if (variantFormat === "dash") return `${name} - ${variantLabel}`;
  return `${name} (${variantLabel})`;
};

export const formatOrderItemQuantityLabel = (
  item = {},
  options = {},
) => `${getOrderItemQuantity(item)} x ${formatOrderItemLabel(item, options)}`;

export const formatOrderItemsSummary = (
  items = [],
  options = {},
) => {
  if (!Array.isArray(items) || items.length === 0) return "No items";
  return items.map((item) => formatOrderItemQuantityLabel(item, options)).join(", ");
};
