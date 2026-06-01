import React, { createContext, useContext, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { LogIn, ShieldAlert } from "lucide-react"

const LoginRequiredContext = createContext(null)

export function LoginRequiredProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [redirectPath, setRedirectPath] = useState("")
  const [customMessage, setCustomMessage] = useState("")
  const navigate = useNavigate()

  const triggerLoginRequired = useCallback((path, message = "") => {
    setRedirectPath(path || window.location.pathname + window.location.search)
    setCustomMessage(message)
    setIsOpen(true)
  }, [])

  const handleLogin = () => {
    setIsOpen(false)
    const loginUrl = redirectPath
      ? `/user/auth/login?redirect=${encodeURIComponent(redirectPath)}`
      : "/user/auth/login"
    navigate(loginUrl)
  }

  return (
    <LoginRequiredContext.Provider value={{ triggerLoginRequired }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[400px] p-6 rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] shadow-2xl">
          <DialogHeader className="flex flex-col items-center text-center space-y-4 pt-4">
            <div className="w-16 h-16 bg-[#EB590E]/10 rounded-full flex items-center justify-center animate-bounce">
              <ShieldAlert className="w-8 h-8 text-[#EB590E]" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-black text-gray-900 dark:text-white">
                Login Required
              </DialogTitle>
              <DialogDescription className="text-gray-500 dark:text-gray-400 font-medium text-sm px-2">
                {customMessage || "You need to log in to perform this action. Sign in to enjoy all our premium features!"}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 gap-3 mt-6 sm:flex-row sm:justify-center">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="h-12 rounded-2xl font-bold border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#222] transition-all"
            >
              Cancel
            </Button>
            <Button
              onClick={handleLogin}
              className="h-12 rounded-2xl font-bold bg-[#EB590E] hover:bg-[#D94F0C] text-white hover:shadow-lg hover:shadow-[#EB590E]/20 transition-all flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Login Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LoginRequiredContext.Provider>
  )
}

export function useLoginRequired() {
  const context = useContext(LoginRequiredContext)
  if (!context) {
    throw new Error("useLoginRequired must be used within a LoginRequiredProvider")
  }
  return context
}
