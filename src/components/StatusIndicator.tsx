import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { AlertSeverity } from '../types/pharmacy';

interface StatusIndicatorProps {
  severity: AlertSeverity;
  label: string;
  compact?: boolean;
}

const SEVERITY_MAP: Record<
  AlertSeverity,
  { text: string; bg: string; border: string; Icon: typeof CheckCircle2 }
> = {
  green: {
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    Icon: CheckCircle2,
  },
  yellow: {
    text: 'text-amber-800',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    Icon: AlertTriangle,
  },
  orange: {
    text: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    Icon: Clock,
  },
  red: {
    text: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    Icon: AlertCircle,
  },
};

export function StatusIndicator({ severity, label, compact = false }: StatusIndicatorProps) {
  const { text, Icon } = SEVERITY_MAP[severity];

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${text}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${text}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function getSeveritySurfaceClasses(severity: AlertSeverity): string {
  const { bg, border } = SEVERITY_MAP[severity];
  return `${bg} ${border}`;
}
