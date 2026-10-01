'use client';

export function ConfirmationCheckbox({ checked, onChange, label, disabled = false, compact = false }: {
  checked: boolean; onChange: (checked: boolean) => void; label: string;
  disabled?: boolean; compact?: boolean;
}) {
  return <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-blush/20 bg-bordeaux text-sm text-taupe ${compact ? 'p-3 leading-snug' : 'p-4 leading-relaxed'} ${disabled ? 'cursor-default opacity-50' : ''}`}>
    <input type="checkbox" checked={checked} disabled={disabled}
      onChange={event => onChange(event.target.checked)}
      className="mt-1 h-4 w-4 shrink-0 accent-blush" />
    <span>{label}</span>
  </label>;
}
