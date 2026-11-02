export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">G</span>
      <span>
        Grow<span className="text-brand-600">Vibe</span> <span className="font-normal text-slate-400">CRM</span>
      </span>
    </span>
  );
}
