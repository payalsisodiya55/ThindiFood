import { Navigate, useLocation } from "react-router-dom"
import { isModuleAuthenticated } from "@food/utils/auth"
import { canAccessAdminPath } from "@food/utils/adminPermissions"

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  const isAuthenticated = isModuleAuthenticated("admin")

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  let effectiveAdminUser = null
  try {
    const stored = localStorage.getItem("admin_user")
    effectiveAdminUser = stored ? JSON.parse(stored) : null
  } catch {
    effectiveAdminUser = null
  }

  if (effectiveAdminUser && !canAccessAdminPath(effectiveAdminUser, location.pathname)) {
    return <Navigate to="/admin/food" replace />
  }

  return children
}
