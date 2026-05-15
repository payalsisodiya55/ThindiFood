let confirmHandler = null
let alertHandler = null

const nativeAlert =
  typeof window !== "undefined" && typeof window.alert === "function"
    ? window.alert.bind(window)
    : null

const nativeConfirm =
  typeof window !== "undefined" && typeof window.confirm === "function"
    ? window.confirm.bind(window)
    : null

const normalizeDialogOptions = (input, defaults = {}) => {
  if (typeof input === "string") {
    return {
      ...defaults,
      description: input,
    }
  }

  return {
    ...defaults,
    ...(input || {}),
  }
}

export const registerAppDialogHandlers = (handlers) => {
  confirmHandler = handlers?.confirm || null
  alertHandler = handlers?.alert || null
}

export const alertApp = (input) => {
  const options = normalizeDialogOptions(input, {
    title: "Notice",
    confirmText: "OK",
    hideCancel: true,
  })

  if (alertHandler) {
    return alertHandler(options)
  }

  nativeAlert?.(options.description || options.message || "")
  return Promise.resolve()
}

export const confirmApp = (input) => {
  const options = normalizeDialogOptions(input, {
    title: "Confirm action",
    confirmText: "Confirm",
    cancelText: "Cancel",
    tone: "danger",
  })

  if (confirmHandler) {
    return confirmHandler(options)
  }

  return Promise.resolve(
    nativeConfirm?.(options.description || options.message || "") ?? false
  )
}
