const toArray = (value) => (Array.isArray(value) ? value : [])

export const normalizeFoodVariants = (value) =>
  toArray(value)
    .map((entry = {}, index) => {
      const id = String(entry?.id || entry?._id || `variant-${index}`)
      const name = String(entry?.name || "").trim()
      const price = Number(entry?.price)
      if (!name || !Number.isFinite(price) || price <= 0) return null

      return {
        id,
        _id: id,
        name,
        price,
      }
    })
    .filter(Boolean)

export const getFoodVariants = (item = {}) =>
  normalizeFoodVariants(item?.variants || item?.variations || [])

export const hasFoodVariants = (item = {}) => getFoodVariants(item).length > 0

export const getDefaultFoodVariant = (item = {}) => getFoodVariants(item)[0] || null

export const getFoodDisplayPrice = (item = {}) => {
  const variants = getFoodVariants(item)
  if (variants.length > 0) {
    return Math.min(...variants.map((variant) => Number(variant.price) || 0))
  }

  const price = Number(item?.price)
  return Number.isFinite(price) ? price : 0
}

export const formatPrice = (amount) => {
  const n = Number(amount)
  if (!Number.isFinite(n)) return "0"
  if (Number.isInteger(n) || n % 1 === 0) return String(Math.round(n))
  const formatted = n.toFixed(2)
  return formatted.endsWith(".00") ? String(Math.round(n)) : formatted
}

export const getFoodPriceLabel = (item = {}) => {
  const price = getFoodDisplayPrice(item)
  return hasFoodVariants(item) ? `Starting from ₹${formatPrice(price)}` : `₹${formatPrice(price)}`
}

export const buildCartLineId = (itemId, variantId = "", itemType = "food") => {
  const normalizedItemType = String(itemType || "food").trim().toLowerCase()
  const suffix = `${String(itemId || "")}::${String(variantId || "base")}`
  return normalizedItemType === "addon" ? `addon::${suffix}` : suffix
}
