import { useState, useMemo, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "./button"

export function DateRangeCalendar({ startDate, endDate, onDateRangeChange, onClose }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [tempStartDate, setTempStartDate] = useState(startDate)
  const [tempEndDate, setTempEndDate] = useState(endDate)

  const today = new Date()
  today.setHours(23, 59, 59, 999)

  // Sync current month with selected dates
  useEffect(() => {
    if (startDate) {
      setCurrentMonth(new Date(startDate.getFullYear(), startDate.getMonth(), 1))
    }
  }, [startDate])

  // Sync internal state with props
  useEffect(() => {
    setTempStartDate(startDate)
    setTempEndDate(endDate)
  }, [startDate, endDate])

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - startDate.getDay() + (startDate.getDay() === 0 ? -6 : 1)) // Start from Monday

    const days = []
    const currentDate = new Date(startDate)

    // Generate 6 weeks (42 days)
    for (let i = 0; i < 42; i++) {
      days.push(new Date(currentDate))
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return days
  }, [currentMonth])

  // Check if date is in current month
  const isCurrentMonth = (date) => {
    return date.getMonth() === currentMonth.getMonth()
  }

  // Check if date is a future date (disable future dates)
  const isFutureDate = (date) => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return d > t
  }

  // Check if date is in range
  const isInRange = (date) => {
    if (!tempStartDate && !tempEndDate) return false
    if (tempStartDate && tempEndDate) {
      const dateTime = date.getTime()
      const startTime = tempStartDate.getTime()
      const endTime = tempEndDate.getTime()
      return dateTime >= startTime && dateTime <= endTime
    }
    return false
  }

  // Check if date is start date
  const isStartDate = (date) => {
    if (!tempStartDate) return false
    return date.toDateString() === tempStartDate.toDateString()
  }

  // Check if date is end date
  const isEndDate = (date) => {
    if (!tempEndDate) return false
    return date.toDateString() === tempEndDate.toDateString()
  }

  // Handle date click
  const handleDateClick = (date) => {
    if (isFutureDate(date)) return // Disable future dates
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      // Start new selection
      setTempStartDate(date)
      setTempEndDate(null)
    } else if (tempStartDate && !tempEndDate) {
      // Select end date
      let finalStart = tempStartDate
      let finalEnd = date
      if (date.getTime() < tempStartDate.getTime()) {
        // If clicked date is before start date, swap them
        finalStart = date
        finalEnd = tempStartDate
      }
      setTempStartDate(finalStart)
      setTempEndDate(finalEnd)
      // Apply the selection
      onDateRangeChange(finalStart, finalEnd)
      if (onClose) {
        setTimeout(() => onClose(), 300)
      }
    }
  }

  // Navigate months
  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"]
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  const formatDateRange = () => {
    if (tempStartDate && tempEndDate) {
      return `${tempStartDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} - ${tempEndDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
    } else if (tempStartDate) {
      return `${tempStartDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} - Select end date`
    }
    return "Select start date"
  }

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-full" style={{ minWidth: '320px', maxWidth: '400px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPreviousMonth}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold text-gray-900">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNextMonth}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Week days header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((date, index) => {
          const isCurrentMonthDay = isCurrentMonth(date)
          const isToday = date.toDateString() === new Date().toDateString()
          const inRange = isInRange(date)
          const isStart = isStartDate(date)
          const isEnd = isEndDate(date)
          const future = isFutureDate(date)

          return (
            <button
              key={index}
              onClick={() => handleDateClick(date)}
              disabled={future}
              className={`
                h-9 w-9 text-xs rounded-md transition-colors relative
                ${future ? 'text-gray-300 cursor-not-allowed' : isCurrentMonthDay ? 'text-gray-900' : 'text-gray-400'}
                ${isStart || isEnd
                  ? 'bg-green-500 text-white font-semibold'
                  : inRange
                  ? 'bg-green-100 text-green-700'
                  : future
                  ? ''
                  : 'hover:bg-gray-100'
                }
                ${isToday && !isStart && !isEnd && !inRange && !future ? 'bg-blue-50 text-blue-600 font-medium' : ''}
              `}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>

      {/* Selected date range display */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-600 text-center font-medium">
          {formatDateRange()}
        </div>
      </div>
    </div>
  )
}
