import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@food/utils/utils"
import { Button, buttonVariants } from "@food/components/ui/button"

// ---------------------------------------------------------------------------
// CalendarDropdown – custom Dropdown that replaces the native <select>
// with a brand-themed green (#00c87e) popover list.
// ---------------------------------------------------------------------------
function CalendarDropdown({
  value,
  onChange,
  options = [],
  // Pull out rdp-specific props so they don't land on the DOM element
  components: _components,
  classNames: _classNames,
  className,
  ...rest
}) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef(null)
  const listRef = React.useRef(null)

  // Derive the display label from options array
  const selectedLabel =
    options.find((o) => String(o.value) === String(value))?.label ??
    String(value ?? "")

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Scroll selected item into view when list opens
  React.useEffect(() => {
    if (!open || !listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    selected?.scrollIntoView({ block: "nearest" })
  }, [open])

  const handleSelect = (optionValue) => {
    // Simulate a native select change event that rdp expects
    const event = { target: { value: String(optionValue) } }
    onChange?.(event)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Branded trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md pl-2 pr-1 h-8 text-sm font-medium text-gray-900 border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer select-none transition-colors"
      >
        <span>{selectedLabel}</span>
        <ChevronDownIcon className="size-3.5 text-gray-400 shrink-0" />
      </button>

      {/* Hidden native select for accessibility / rdp internals */}
      <select
        {...rest}
        value={value}
        onChange={onChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Custom styled dropdown list */}
      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-0 z-[300] mt-1 min-w-full max-h-52 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value)
            return (
              <button
                key={option.value}
                type="button"
                data-selected={isSelected}
                disabled={option.disabled}
                onClick={() => handleSelect(option.value)}
                className={cn(
                  "w-full px-3 py-1.5 text-sm text-left transition-colors",
                  isSelected
                    ? "bg-[#00c87e] text-white font-semibold"
                    : "text-gray-900 hover:bg-[#e6faf3] hover:text-[#00664a]",
                  option.disabled &&
                    "opacity-40 cursor-not-allowed pointer-events-none"
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CalendarDayButton
// ---------------------------------------------------------------------------
function CalendarDayButton({ className, day, modifiers, ...props }) {
  const defaultClassNames = getDefaultClassNames()
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const isSelectedSingle =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={isSelectedSingle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        "data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground",
        "data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground",
        "data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground",
        "group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50",
        "dark:hover:text-accent-foreground",
        "flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal",
        "group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px]",
        "data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md",
        "data-[range-middle=true]:rounded-none",
        "data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md",
        "[&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// CalendarChevron
// ---------------------------------------------------------------------------
function CalendarChevron({ className, orientation, ...props }) {
  if (orientation === "left") {
    return <ChevronLeftIcon className={cn("size-4", className)} {...props} />
  }
  if (orientation === "right") {
    return <ChevronRightIcon className={cn("size-4", className)} {...props} />
  }
  return <ChevronDownIcon className={cn("size-4", className)} {...props} />
}

// ---------------------------------------------------------------------------
// CalendarRoot
// ---------------------------------------------------------------------------
function CalendarRoot({ className, rootRef, ...props }) {
  return (
    <div
      data-slot="calendar"
      ref={rootRef}
      className={cn(className)}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// CalendarWeekNumber
// ---------------------------------------------------------------------------
function CalendarWeekNumber({ week: _week, children, ...props }) {
  return (
    <th {...props}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">
        {children}
      </div>
    </th>
  )
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      style={{
        "--primary": "#00c87e",
        "--primary-foreground": "#ffffff",
        "--ring": "#00c87e",
        "--accent": "#e6faf3",
        "--accent-foreground": "#00664a",
      }}
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:--spacing(8)]",
        "[[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex gap-4 flex-col md:flex-row relative",
          defaultClassNames.months
        ),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative has-focus:border-[#00c87e] border border-input shadow-xs has-focus:ring-[#00c87e]/30 has-focus:ring-[3px] rounded-md",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute bg-popover inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-full h-full p-0 text-center group/day aspect-square select-none",
          "[&:last-child[data-selected=true]_button]:rounded-r-md",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-md"
            : "[&:first-child[data-selected=true]_button]:rounded-l-md",
          defaultClassNames.day
        ),
        range_start: cn("rounded-l-md bg-accent", defaultClassNames.range_start),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        today: cn(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        Dropdown: CalendarDropdown,
        WeekNumber: CalendarWeekNumber,
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
