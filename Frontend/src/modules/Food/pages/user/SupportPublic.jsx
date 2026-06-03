import { Link } from "react-router-dom"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Card, CardContent } from "@food/components/ui/card"
import { Mail, ArrowLeft, Headphones, CheckCircle2, ChevronRight, AlertCircle, Info, ShieldAlert, Award, Phone, Globe } from "lucide-react"

export default function SupportPublic() {
  const helpItems = [
    "Food order issues",
    "Delayed deliveries",
    "Missing or incorrect items",
    "Payment and refund concerns",
    "Restaurant-related issues",
    "Account login or verification problems",
    "App crashes or technical issues",
    "Promo code and discount problems",
    "Suggestions and feature requests",
    "General questions about Taamio"
  ]

  const fastAssistanceItems = [
    "Order number",
    "Restaurant name",
    "Description of the issue",
    "Screenshot (if applicable)",
    "Payment confirmation (if available)"
  ]

  const techSupportSteps = [
    "Update the app to the latest version",
    "Restart your device",
    "Check your internet connection",
    "Clear the app cache (if applicable)"
  ]

  const isRestaurant = window.location.pathname.includes("/restaurant")
  const backPath = isRestaurant ? "/food/restaurant" : "/"

  return (
    <AnimatedPage className="min-h-screen bg-[#f8fafc] dark:bg-[#0a0a0a] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="h-12 w-12 rounded-full bg-[#00c87e]/10 dark:bg-[#00c87e]/20 flex items-center justify-center text-[#00c87e] shadow-sm">
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Support
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Get help from our support team.
            </p>
          </div>
        </div>

        {/* Main Content Card */}
        <Card className="bg-white dark:bg-[#111111] rounded-2xl shadow-sm border border-slate-100 dark:border-zinc-800 overflow-hidden">
          <CardContent className="p-6 sm:p-10 space-y-8">
            
            {/* Welcome Text */}
            <div className="space-y-4 text-slate-700 dark:text-slate-300 text-sm md:text-base leading-relaxed font-normal">
              <p>
                Welcome to the Support Center for <span className="font-bold text-slate-900 dark:text-white">Taamio</span>. We are committed to providing a smooth, fast, and reliable food ordering experience through our takeaway and delivery services. Whether you need help with placing an order, delivery tracking, payments, account issues, or app performance, our support team is here to assist you.
              </p>
              <p>
                At Taamio, we continuously work to improve our platform and ensure that customers can easily discover restaurants, order their favorite meals, and enjoy a seamless food delivery experience.
              </p>
            </div>

            {/* How We Can Help */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-[#00c87e]" />
                How We Can Help
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {helpItems.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50/50 dark:bg-zinc-900/50 border border-slate-100/50 dark:border-zinc-800/30">
                    <CheckCircle2 className="h-4 w-4 text-[#00c87e] shrink-0 mt-0.5" />
                    <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <hr className="border-slate-100 dark:border-zinc-800" />

            {/* Order & Delivery Support */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-[#00c87e]" />
                Order & Delivery Support
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                If your order is delayed, incomplete, or incorrect, please contact our support team with the relevant order details. We will review the issue and work to provide a suitable resolution as quickly as possible.
              </p>
              <div className="bg-[#00c87e]/5 dark:bg-[#00c87e]/10 border border-[#00c87e]/10 dark:border-[#00c87e]/20 rounded-xl p-4 sm:p-5 space-y-3">
                <p className="text-xs sm:text-sm font-bold text-[#00c87e] flex items-center gap-1.5">
                  <Info className="h-4 w-4 shrink-0" />
                  For faster assistance, please include:
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium pl-1">
                  {fastAssistanceItems.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <ChevronRight className="h-3 w-3 text-[#00c87e] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <hr className="border-slate-100 dark:border-zinc-800" />

            {/* Payment & Refund Assistance */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-[#00c87e]" />
                Payment & Refund Assistance
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                If you experience failed payments, duplicate charges, or refund-related issues, please contact us with complete transaction details. Refund processing times may vary depending on your payment provider or bank.
              </p>
            </div>

            <hr className="border-slate-100 dark:border-zinc-800" />

            {/* Technical Support */}
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-[#00c87e]" />
                Technical Support
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                If you experience problems while using the app, please try the following steps:
              </p>
              <ul className="space-y-2.5 pl-1">
                {techSupportSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
                    <span className="h-5 w-5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 text-xs flex items-center justify-center shrink-0 font-bold">
                      {idx + 1}
                    </span>
                    <span className="mt-0.5">{step}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 italic">
                If the issue persists, contact us with details about your device and app version.
              </p>
            </div>

            <hr className="border-slate-100 dark:border-zinc-800" />

            {/* Food Quality & Customer Safety */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-[#00c87e]" />
                Food Quality & Customer Safety
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Taamio encourages all restaurant partners to maintain high standards of food quality, hygiene, and customer service. If you encounter any food quality or safety concerns, please report them immediately so that appropriate action can be taken.
              </p>
            </div>

            <hr className="border-slate-100 dark:border-zinc-800" />

            {/* Feedback & Suggestions */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-[#00c87e]" />
                Feedback & Suggestions
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Your feedback helps us improve Taamio and provide a better experience for all users. We welcome suggestions regarding new features, restaurant partners, and service improvements.
              </p>
            </div>

            {/* Contact Support Box */}
            <div className="bg-[#f8fafc] dark:bg-[#161616] border border-slate-100 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950 dark:text-white">
                  Contact Us
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  For support or queries, users may contact:
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Email</span>
                    <a
                      href="mailto:support@taamio.com"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-[#202020] border border-slate-200/60 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:border-[#00c87e] dark:hover:border-[#00c87e] hover:bg-[#00c87e]/5 dark:hover:bg-[#00c87e]/5 transition-all duration-300 shadow-sm w-full justify-start"
                    >
                      <Mail className="h-4.5 w-4.5 text-[#00c87e]" />
                      <span className="text-sm font-bold tracking-tight text-left">support@taamio.com</span>
                    </a>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Customer Support</span>
                    <a
                      href="tel:8667540557"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-[#202020] border border-slate-200/60 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:border-[#00c87e] dark:hover:border-[#00c87e] hover:bg-[#00c87e]/5 dark:hover:bg-[#00c87e]/5 transition-all duration-300 shadow-sm w-full justify-start"
                    >
                      <Phone className="h-4.5 w-4.5 text-[#00c87e]" />
                      <span className="text-sm font-bold tracking-tight">86675 40557</span>
                    </a>
                  </div>

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Website</span>
                    <a
                      href="https://www.taamio.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-[#202020] border border-slate-200/60 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:border-[#00c87e] dark:hover:border-[#00c87e] hover:bg-[#00c87e]/5 dark:hover:bg-[#00c87e]/5 transition-all duration-300 shadow-sm w-full justify-start"
                    >
                      <Globe className="h-4.5 w-4.5 text-[#00c87e]" />
                      <span className="text-sm font-bold tracking-tight">www.taamio.com</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* App Trust Footer */}
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center leading-relaxed font-medium">
              We appreciate your trust in Taamio and thank you for choosing us for your takeaway and food delivery needs.
            </p>

          </CardContent>
        </Card>

        {/* Back Link at the bottom */}
        <div className="flex justify-start px-2">
          <Link
            to={backPath}
            className="inline-flex items-center gap-2 text-sm sm:text-base font-bold text-[#00c87e] hover:opacity-85 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to App</span>
          </Link>
        </div>
      </div>
    </AnimatedPage>
  )
}
