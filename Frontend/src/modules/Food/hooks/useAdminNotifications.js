import { useMemo } from "react";
import useNotificationInbox from "@food/hooks/useNotificationInbox";

const toDateLabel = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const buildMetaLabel = (item) => {
  const restaurantName = item?.category?.includes("restaurant")
    ? item?.metadata?.restaurantName
    : "";
  return [restaurantName, item?.category].filter(Boolean).join(" | ");
};

export default function useAdminNotifications(options = {}) {
  const inbox = useNotificationInbox("admin", {
    limit: options?.limit || 100,
    pollMs: options?.pollMs || 30000,
    autoload: options?.autoload,
  });

  const items = useMemo(
    () =>
      (Array.isArray(inbox.items) ? inbox.items : []).map((item) => ({
        ...item,
        path: item.link || "/admin/food/restaurants/joining-request",
        isRead: Boolean(item.read),
        timeLabel: toDateLabel(item.createdAt),
        metaLabel: buildMetaLabel(item),
      })),
    [inbox.items]
  );

  return useMemo(
    () => ({
      items,
      loading: inbox.loading,
      unreadCount: inbox.unreadCount,
      refresh: inbox.refresh,
      markAsRead: inbox.markAsRead,
      dismissOne: inbox.dismiss,
      clearAll: inbox.dismissAll,
    }),
    [
      inbox.dismiss,
      inbox.dismissAll,
      inbox.loading,
      inbox.markAsRead,
      inbox.refresh,
      inbox.unreadCount,
      items,
    ]
  );
}
