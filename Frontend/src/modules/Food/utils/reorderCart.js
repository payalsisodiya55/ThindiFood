import { restaurantAPI } from "@food/api"
import { buildCartLineId, getFoodVariants } from "@food/utils/foodVariants"
import { flattenMenuItems, getMenuFromResponse } from "@food/utils/menuItems"

const normalizeString = (value) => String(value || "").trim().toLowerCase()

const resolveVegFlag = (item, fallbackItem) => {
  if (typeof item?.isVeg === "boolean") return item.isVeg
  if (typeof fallbackItem?.isVeg === "boolean") return fallbackItem.isVeg

  const foodType = normalizeString(item?.foodType || fallbackItem?.foodType)
  const category = normalizeString(item?.category || fallbackItem?.category)
  return foodType === "veg" || category === "veg"
}

const findMatchingVariant = (orderedItem, menuItem) => {
  const variants = getFoodVariants(menuItem)
  if (!variants.length) return null

  const orderedVariantId = String(
    orderedItem?.variantId || orderedItem?.variant?._id || orderedItem?.variant?.id || "",
  )
  const orderedVariantName = normalizeString(
    orderedItem?.variantName || orderedItem?.variant?.name,
  )
  const orderedPrice = Number(orderedItem?.price)

  return (
    variants.find((variant) => String(variant.id || variant._id || "") === orderedVariantId) ||
    variants.find((variant) => normalizeString(variant.name) === orderedVariantName) ||
    variants.find((variant) => {
      const variantPrice = Number(variant?.price)
      return Number.isFinite(orderedPrice) && Number.isFinite(variantPrice) && variantPrice === orderedPrice
    }) ||
    null
  )
}

export const buildReorderCartItems = async ({
  items,
  restaurantName,
  restaurantId,
  restaurantLookupId,
}) => {
  const safeItems = Array.isArray(items) ? items : []
  let menuItemsById = new Map()

  if (restaurantLookupId || restaurantId) {
    try {
      const menuResponse = await restaurantAPI.getMenuByRestaurantId(
        restaurantLookupId || restaurantId,
        { noCache: true },
      )
      const menu = getMenuFromResponse(menuResponse)
      const flatMenuItems = flattenMenuItems(menu)
      menuItemsById = new Map(
        flatMenuItems.map((item) => [String(item?.id || item?._id || ""), item]),
      )
    } catch {
      menuItemsById = new Map()
    }
  }

  return safeItems
    .map((item, index) => {
      const baseItemId = String(item?.itemId || item?.id || item?._id || "")
      if (!baseItemId) return null

      const menuItem = menuItemsById.get(baseItemId) || null
      const matchedVariant = findMatchingVariant(item, menuItem)
      const variantId = String(
        item?.variantId || item?.variant?._id || item?.variant?.id || matchedVariant?.id || "",
      )
      const variantName =
        item?.variantName ||
        item?.variant?.name ||
        matchedVariant?.name ||
        ""
      const lineItemId = buildCartLineId(baseItemId, variantId)
      const fallbackPrice = matchedVariant?.price ?? menuItem?.price ?? 0
      const itemPrice = Number(item?.price)
      const resolvedPrice = Number.isFinite(itemPrice) ? itemPrice : Number(fallbackPrice) || 0

      return {
        id: lineItemId,
        lineItemId,
        itemId: baseItemId,
        productId: baseItemId,
        name: item?.name || item?.foodName || menuItem?.name || "Item",
        price: resolvedPrice,
        variantId,
        variantName,
        variantPrice: Number(matchedVariant?.price ?? resolvedPrice) || resolvedPrice,
        image: item?.image || menuItem?.image || "",
        restaurant: restaurantName || "Restaurant",
        restaurantId: restaurantId || restaurantLookupId || null,
        description: item?.description || menuItem?.description || "",
        originalPrice: item?.originalPrice ?? menuItem?.originalPrice,
        isVeg: resolveVegFlag(item, menuItem),
        quantity: Math.max(1, Number(item?.quantity || item?.qty) || 1),
        preparationTime:
          item?.preparationTime ??
          item?.prep_time ??
          menuItem?.preparationTime ??
          null,
        offer: item?.offer ?? menuItem?.offer,
        reorderIndex: index,
      }
    })
    .filter(Boolean)
}
