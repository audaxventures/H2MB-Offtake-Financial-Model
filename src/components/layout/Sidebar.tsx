import {
  BarChart3,
  LayoutDashboard,
  Receipt,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ViewId = 'assumptions' | 'revenue' | 'expenses' | 'annual' | 'sources';

interface NavItem {
  id: ViewId;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'assumptions', label: 'Assumptions Dashboard', icon: LayoutDashboard },
  { id: 'revenue', label: 'Revenue Streams', icon: TrendingUp },
  { id: 'expenses', label: 'Expense Items', icon: Receipt },
  { id: 'annual', label: 'Annual Summary', icon: BarChart3 },
  { id: 'sources', label: 'Sources & Uses / ITC', icon: Zap },
];

interface SidebarProps {
  active: ViewId;
  onNavigate: (view: ViewId) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-64 shrink-0 flex-col border-r lg:flex">
      <div className="px-5 py-5">
        <img src="/logo.png" alt="H2MB Inc." className="h-auto w-full" />
        <p className="text-muted-foreground mt-1.5 text-xs leading-tight">
          Project Finance Model
        </p>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="text-muted-foreground mt-auto px-5 py-4 text-xs leading-relaxed">
        <p className="font-medium">Manitoba's first commercial-scale</p>
        <p>green hydrogen production &amp; dispensing facility.</p>
        <p className="mt-2">2.5 MW PEM electrolyzer · up to 1,000 kg/day</p>
      </div>
    </aside>
  );
}
