export default function BottomPopup({
  isOpen,
  onClose,
  title = "",
  children,
  maxHeight = "80vh",
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-3xl p-4 shadow-xl"
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-gray-300" />
        {title ? (
          <h3 className="text-base font-semibold text-gray-900 mb-3">{title}</h3>
        ) : null}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
