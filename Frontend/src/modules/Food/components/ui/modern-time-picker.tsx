import * as React from "react"
import { Clock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { cn } from "@food/utils/utils"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"

// Extend dayjs with customParseFormat to handle parsing time strings correctly
dayjs.extend(customParseFormat)

interface ModernTimePickerProps {
  value: string // Expects "HH:mm" (24h format)
  onChange: (value: string) => void
  label?: string
  error?: string
  className?: string
}

const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, "0"))
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"))
const periods = ["AM", "PM"]
const TIME_OPTION_HEIGHT = 44

export function ModernTimePicker({
  value,
  onChange,
  label,
  error,
  className,
}: ModernTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  // Parse 24h value into 12h components using dayjs
  const components = React.useMemo(() => {
    const time = dayjs(`2000-01-01 ${value || "10:00"}`, "YYYY-MM-DD HH:mm")
    return {
      hour: time.format("hh"),
      minute: time.format("mm"),
      period: time.format("A"),
    }
  }, [value])

  const displayValue = `${components.hour}:${components.minute} ${components.period}`

  const handleTimeChange = (type: "hour" | "minute" | "period", val: string) => {
    const newComponents = { ...components, [type]: val }
    const timeStr = `${newComponents.hour}:${newComponents.minute} ${newComponents.period}`
    const time24 = dayjs(timeStr, "hh:mm A").format("HH:mm")
    onChange(time24)
  }

  return (
    <div className={cn("flex flex-col gap-1.5 w-full", className)}>
      {label && <span className="text-sm font-medium text-gray-700">{label}</span>}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-3 w-full rounded-xl border bg-white px-3 py-2.5 text-left transition-all",
              "hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-900",
              error ? "border-red-500" : "border-gray-300",
              isOpen && "border-gray-900 ring-2 ring-black/5",
              "h-11 shadow-sm"
            )}
            aria-label={label || "Select time"}
          >
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-sm text-gray-900 font-medium">
              {displayValue}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent 
          className="p-0 w-auto overflow-hidden rounded-2xl border border-gray-200 shadow-xl z-[1000] animate-in fade-in zoom-in-95 duration-200" 
          align="start"
          sideOffset={8}
        >
          <div className="relative flex h-72 select-none bg-white">
            {/* Top/Bottom Fade Gradients */}
            <div className="absolute inset-x-0 top-[35px] h-16 bg-gradient-to-b from-white to-transparent z-20 pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent z-20 pointer-events-none" />
            
            <TimeColumn
              options={hours}
              selected={components.hour}
              onSelect={(v) => handleTimeChange("hour", v)}
              label="Hour"
            />
            <TimeColumn
              options={minutes}
              selected={components.minute}
              onSelect={(v) => handleTimeChange("minute", v)}
              label="Min"
            />
            <TimeColumn
              options={periods}
              selected={components.period}
              onSelect={(v) => handleTimeChange("period", v)}
              label="AM/PM"
              isLast
            />
          </div>
        </PopoverContent>
      </Popover>
      {error && <p className="text-[11px] font-medium text-red-600 mt-0.5 ml-1">{error}</p>}
    </div>
  )
}

interface TimeColumnProps {
  options: string[]
  selected: string
  onSelect: (value: string) => void
  label: string
  isLast?: boolean
}

function TimeColumn({ options, selected, onSelect, label, isLast }: TimeColumnProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const scrollTimeoutRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null)

  const getSelectedScrollTop = React.useCallback((target: string) => {
    const selectedIndex = Math.max(options.indexOf(target), 0)
    const container = scrollRef.current
    if (!container) return 0
    const centerOffset = container.offsetHeight / 2 - TIME_OPTION_HEIGHT / 2
    return selectedIndex * TIME_OPTION_HEIGHT + 128 - centerOffset
  }, [options])

  const commitScrollSelection = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollRef.current
    if (!container) return

    const centerOffset = container.offsetHeight / 2 - TIME_OPTION_HEIGHT / 2
    const rawIndex = (container.scrollTop + centerOffset - 128) / TIME_OPTION_HEIGHT
    const nextIndex = Math.min(options.length - 1, Math.max(0, Math.round(rawIndex)))
    const nextValue = options[nextIndex]
    const nextScrollTop = getSelectedScrollTop(nextValue)

    if (Math.abs(container.scrollTop - nextScrollTop) > 1) {
      container.scrollTo({ top: nextScrollTop, behavior })
    }

    if (nextValue !== selected) {
      onSelect(nextValue)
    }
  }, [getSelectedScrollTop, onSelect, options, selected])

  // Scroll to selected element on open
  React.useEffect(() => {
    const scrollToSelected = () => {
      const container = scrollRef.current
      if (container) {
        container.scrollTop = getSelectedScrollTop(selected)
      }
    }

    // Run immediately
    scrollToSelected()

    // Run again with a brief delay to account for transitions and dynamic portal sizing
    const timer = window.setTimeout(scrollToSelected, 30)
    return () => window.clearTimeout(timer)
  }, [getSelectedScrollTop, selected])

  React.useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  const handleScroll = React.useCallback(() => {
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current)
    }

    scrollTimeoutRef.current = window.setTimeout(() => {
      commitScrollSelection("smooth")
    }, 100)
  }, [commitScrollSelection])

  return (
    <div className={cn(
      "flex flex-col border-r border-gray-100 last:border-r-0",
      isLast ? "w-20" : "w-16 sm:w-20"
    )}>
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold px-3 py-2 bg-gray-50/50 text-center border-b border-gray-100 sticky top-0 z-30">
        {label}
      </div>
      <div 
        ref={scrollRef}
        data-lenis-prevent
        onScroll={handleScroll}
        onPointerUp={() => commitScrollSelection("smooth")}
        onTouchEnd={() => commitScrollSelection("smooth")}
        onMouseUp={() => commitScrollSelection("smooth")}
        className="overflow-y-auto overflow-x-hidden scrollbar-hide flex-1 relative snap-y snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="py-32"> {/* Centering padding */}
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              data-selected={selected === opt}
              onClick={() => onSelect(opt)}
              className={cn(
                "flex h-11 w-full snap-center items-center justify-center px-2 text-sm transition-all text-center relative group touch-pan-y",
                selected === opt 
                  ? "text-gray-900 font-bold" 
                  : "text-gray-400 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              {selected === opt && (
                <div className="absolute inset-y-1 inset-x-2 bg-gray-100 rounded-lg -z-10" />
              )}
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
