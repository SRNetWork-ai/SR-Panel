import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("glass-card p-5", className)}>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Card>
  );
}

const TONES: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  red: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
  blue: "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30",
  zinc: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30",
  purple: "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30",
};

export function Badge({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES | string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium backdrop-blur-sm",
        TONES[tone] ?? TONES.zinc,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {action ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function Spinner({ size = 24, className = "" }: { size?: number, className?: string }) {
  // If className is provided (like w-4 h-4), it's meant to be inline without padding wrappers
  if (className) {
    return <Loader2 size={size} className={clsx("animate-spin", className)} />;
  }
  // Otherwise, it's a standalone spinner
  return (
    <div className="flex items-center justify-center py-8 text-violet-500 dark:text-violet-400">
      <Loader2 size={size} className="animate-spin" />
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300 backdrop-blur-sm">
      {message}
    </div>
  );
}
