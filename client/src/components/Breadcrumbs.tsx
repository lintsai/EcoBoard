import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
}

const routeLabels: Record<string, string> = {
  '/teams': '團隊列表',
  '/dashboard': '工作儀表板',
  '/checkin': '早上打卡',
  '/workitems': 'AI 工作項目規劃',
  '/backlog': 'Backlog 工作規劃',
  '/standup-review': '站立會議檢閱',
  '/update-work': '更新工作進度',
  '/daily-summary': '每日總結',
  '/team-management': '團隊管理',
  '/weekly-reports': '週報管理'
};

const defaultTrail: BreadcrumbItem[] = [
  { label: '團隊列表', path: '/teams' },
  { label: '工作儀表板', path: '/dashboard' }
];

function Breadcrumbs({ items }: BreadcrumbsProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const trail = useMemo<BreadcrumbItem[]>(() => {
    if (items?.length) {
      return items;
    }

    const pathname = location.pathname;
    if (pathname === '/login') {
      return [{ label: '登入' }];
    }
    if (pathname === '/teams') {
      return [{ label: '團隊列表' }];
    }
    if (pathname === '/dashboard') {
      return [
        { label: '團隊列表', path: '/teams' },
        { label: '工作儀表板' }
      ];
    }

    const currentLabel = routeLabels[pathname] || '目前頁面';
    return [
      ...defaultTrail,
      { label: currentLabel }
    ];
  }, [items, location.pathname]);

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {trail.map((item, index) => {
        const isLast = index === trail.length - 1;

        return (
          <span className="breadcrumbs-item" key={`${item.label}-${index}`}>
            {index > 0 && (
              <ChevronRight size={14} className="breadcrumbs-separator" aria-hidden="true" />
            )}
            {!isLast && item.path ? (
              <button
                type="button"
                className="breadcrumbs-link"
                onClick={() => navigate(item.path!)}
              >
                {item.label}
              </button>
            ) : (
              <span className="breadcrumbs-current">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export type { BreadcrumbItem };
export default Breadcrumbs;
