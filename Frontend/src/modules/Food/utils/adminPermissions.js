import { adminSidebarMenu } from "@food/utils/adminSidebarMenu"

const normalizeValue = (value) => String(value || "").trim().toLowerCase()

export const isSuperAdminUser = (user) =>
  normalizeValue(user?.adminType) === "superadmin"

export const getAllowedSidebarPermissions = (user) =>
  new Set(
    (Array.isArray(user?.sidebarPermissions) ? user.sidebarPermissions : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  )

export const canAccessAdminPermission = (user, permissionKey) => {
  if (!permissionKey) return true
  if (isSuperAdminUser(user)) return true
  if (permissionKey === "superadmin") return false
  return getAllowedSidebarPermissions(user).has(permissionKey)
}

const collectMenuPaths = (items, results = []) => {
  ;(Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || typeof item !== "object") return
    if (item.type === "link" && item.path) {
      results.push({ path: item.path, permissionKey: item.permissionKey || null })
      return
    }
    if (Array.isArray(item.items)) collectMenuPaths(item.items, results)
    if (Array.isArray(item.subItems)) {
      item.subItems.forEach((subItem) => {
        if (subItem?.path) {
          results.push({ path: subItem.path, permissionKey: subItem.permissionKey || item.permissionKey || null })
        }
      })
    }
  })
  return results
}

const ADMIN_MENU_PATHS = collectMenuPaths(adminSidebarMenu).sort((a, b) => b.path.length - a.path.length)

const ADMIN_PATH_PERMISSION_MATCHERS = [
  { pattern: /^\/admin\/food$/, permissionKey: "dashboard" },
  { pattern: /^\/admin\/food\/zone-setup\/(map|add|edit\/[^/]+|view\/[^/]+)$/, permissionKey: "zones" },
  { pattern: /^\/admin\/food\/restaurants\/(add|edit\/[^/]+|bulk-import|bulk-export)$/, permissionKey: "restaurants" },
]

export const getAdminPermissionForPath = (pathname) => {
  const normalizedPath = String(pathname || "").replace(/\/+$/, "") || "/"

  const matchedMenuPath = ADMIN_MENU_PATHS.find(
    ({ path }) => normalizedPath === path || normalizedPath.startsWith(`${path}/`)
  )
  if (matchedMenuPath) return matchedMenuPath.permissionKey || null

  const matchedPattern = ADMIN_PATH_PERMISSION_MATCHERS.find(({ pattern }) => pattern.test(normalizedPath))
  return matchedPattern?.permissionKey || null
}

export const canAccessAdminPath = (user, pathname) =>
  canAccessAdminPermission(user, getAdminPermissionForPath(pathname))
