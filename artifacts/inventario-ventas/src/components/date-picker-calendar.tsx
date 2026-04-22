import React, { useState, useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { format, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatePickerCalendarProps {
  onDateSelect?: (date: Date | undefined) => void;
  value?: Date;
  placeholder?: string;
  disablePast?: boolean;
  title?: string;
  defaultToToday?: boolean;
  modifiers?: Record<string, Date[]>;
  modifiersClassNames?: Record<string, string>;
  modifiersStyles?: Record<string, React.CSSProperties>;
  customButtonStyles?: Record<string, React.CSSProperties>;
  onDayClick?: (day: Date, modifiers: Record<string, boolean>) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Tailwind class map for react-day-picker v9 ───────────────────────────────

const calendarClassNames = {
  root: "w-full select-none",
  months: "flex flex-col",
  month: "w-full",

  month_caption:
    "flex items-center justify-between px-2 py-3 mb-1",
  caption_label:
    "text-sm font-semibold text-slate-800 dark:text-slate-100 capitalize tracking-wide",

  nav: "flex items-center gap-1",
  button_previous: [
    "flex items-center justify-center w-8 h-8 rounded-xl",
    "text-slate-500 dark:text-slate-400",
    "hover:bg-slate-100 dark:hover:bg-slate-700",
    "transition-colors duration-150",
    "disabled:opacity-30 disabled:pointer-events-none",
  ].join(" "),
  button_next: [
    "flex items-center justify-center w-8 h-8 rounded-xl",
    "text-slate-500 dark:text-slate-400",
    "hover:bg-slate-100 dark:hover:bg-slate-700",
    "transition-colors duration-150",
    "disabled:opacity-30 disabled:pointer-events-none",
  ].join(" "),

  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday:
    "flex-1 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest py-1.5",

  week: "flex mt-0.5",
  day: "flex-1 flex items-center justify-center p-0.5",
  day_button: [
    "w-9 h-9 rounded-xl text-sm font-medium",
    "flex items-center justify-center",
    "transition-all duration-150",
    "text-slate-700 dark:text-slate-200",
    "hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
  ].join(" "),

  selected:
    "[&>button]:bg-blue-600 [&>button]:text-white [&>button]:hover:bg-blue-700 [&>button]:shadow-md [&>button]:shadow-blue-200 dark:[&>button]:shadow-blue-900/30 [&>button]:scale-105",
  today:
    "[&>button]:ring-2 [&>button]:ring-blue-400 [&>button]:ring-offset-1 [&>button]:ring-offset-white dark:[&>button]:ring-offset-slate-800",
  outside:
    "[&>button]:text-slate-300 dark:[&>button]:text-slate-600 [&>button]:hover:bg-transparent [&>button]:cursor-default",
  disabled:
    "[&>button]:text-slate-300 dark:[&>button]:text-slate-600 [&>button]:hover:bg-transparent [&>button]:cursor-not-allowed [&>button]:opacity-50",
  hidden: "invisible",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function DatePickerCalendar({
  onDateSelect,
  value,
  placeholder = "Selecciona una fecha",
  disablePast = true,
  title = "Fecha de vencimiento",
  defaultToToday = false,
  modifiers,
  modifiersClassNames,
  modifiersStyles,
  customButtonStyles,
  onDayClick,
}: DatePickerCalendarProps) {
  const today = startOfDay(new Date());
  const [selected, setSelected] = useState<Date | undefined>(value ?? (defaultToToday ? today : undefined));

  const handleSelect = (date: Date | undefined) => {
    setSelected(date);
    onDateSelect?.(date);
  };

  const CustomDayButton = useMemo(() => {
    if (!customButtonStyles) return undefined;
    const styleMap = customButtonStyles;
    return function StyledDayButton({
      modifiers: mods,
      className,
      style,
      ...rest
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      modifiers?: Record<string, boolean>;
      day?: unknown;
    }) {
      const override = Object.entries(styleMap).find(([key]) => mods?.[key])?.[1];
      return <button className={className} style={override ? { ...style, ...override } : style} {...rest} />;
    };
  }, [customButtonStyles]);

  const formattedDate = selected
    ? capitalize(format(selected, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }))
    : null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 overflow-hidden w-full h-full flex flex-col">

      {/* ── Header strip ── */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4">
        <p className="text-blue-100 text-xs font-semibold uppercase tracking-widest mb-1">
          {title}
        </p>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-white/80 flex-shrink-0" />
          <p className="text-white font-bold text-base leading-tight">
            {formattedDate ?? placeholder}
          </p>
        </div>
      </div>

      {/* ── Calendar ── */}
      <div className="px-3 py-2 flex-1">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          locale={es}
          disabled={disablePast ? { before: today } : undefined}
          classNames={calendarClassNames}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          modifiersStyles={modifiersStyles}
          onDayClick={onDayClick}
          components={{
            Chevron: ({ orientation }: { orientation?: string }) =>
              orientation === "left"
                ? <ChevronLeft className="h-4 w-4" />
                : <ChevronRight className="h-4 w-4" />,
            ...(CustomDayButton ? { DayButton: CustomDayButton as any } : {}),
          }}
        />
      </div>

      {/* ── Selected date label ── */}
      <div className="px-5 pb-4 pt-1">
        <div
          className={[
            "rounded-xl px-4 py-2.5 text-center text-sm font-medium transition-all duration-300",
            selected
              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
              : "bg-slate-50 dark:bg-slate-700/50 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-600",
          ].join(" ")}
        >
          {formattedDate ?? placeholder}
        </div>
      </div>
    </div>
  );
}

export default DatePickerCalendar;
