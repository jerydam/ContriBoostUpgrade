import { cn } from "@/lib/utils";

export function BalanceCard({
  label,
  value,
  valueSuffix,
  subtext,
  actions,
  progress,
  className,
  children,
}) {
  return (
    <div className={cn("relative w-full", className)}>
      <div className="absolute -top-10 -right-10 h-56 w-56 rounded-full bg-primary/25 blur-3xl pointer-events-none" />
      <div className="relative z-10 rounded-2xl border bg-card text-card-foreground p-6 md:p-8 shadow-lg">
        {label && (
          <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
        )}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-3xl md:text-4xl font-bold font-numeric tracking-tight">
            {value}
          </span>
          {valueSuffix && (
            <span className="text-lg font-medium text-muted-foreground">{valueSuffix}</span>
          )}
        </div>
        {subtext && (
          <p className="mt-1 text-sm text-muted-foreground font-numeric break-all">{subtext}</p>
        )}
        {progress}
        {children}
        {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
