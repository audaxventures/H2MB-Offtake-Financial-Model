import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SliderInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  formatValue?: (value: number) => string;
  helperText?: string;
  className?: string;
  accent?: 'default' | 'gold';
}

export function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  formatValue,
  helperText,
  className,
  accent = 'default',
}: SliderInputProps) {
  const displayValue = formatValue
    ? formatValue(value)
    : `${prefix ?? ''}${value.toLocaleString('en-CA')}${suffix ?? ''}`;

  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-muted-foreground">{label}</Label>
        <Input
          type="text"
          value={displayValue}
          onChange={(e) => {
            const numeric = Number(e.target.value.replace(/[^0-9.-]/g, ''));
            if (!Number.isNaN(numeric)) {
              onChange(Math.min(max, Math.max(min, numeric)));
            }
          }}
          className="h-7 w-32 text-right text-sm tabular-nums"
        />
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className={cn(
          accent === 'gold' &&
            '[&_[data-slot=slider-range]]:bg-h2mb-gold [&_[data-slot=slider-thumb]]:border-h2mb-gold',
        )}
      />
      {helperText && (
        <p className="text-muted-foreground text-xs">{helperText}</p>
      )}
    </div>
  );
}
