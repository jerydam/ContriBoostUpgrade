import { cn } from "@/lib/utils";

export function StatTile({ icon: Icon, label, value, className }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {Icon && <Icon className="h-4 w-4" />}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl md:text-2xl font-bold font-numeric truncate">{value}</p>
    </div>
  );
}

export function StatTileRow({ children, className }) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4", className)}>
      {children}
    </div>
  );
}
