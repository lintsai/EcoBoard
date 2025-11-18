import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Users, CheckSquare, MessageSquare, TrendingUp, Settings, Calendar, FileBarChart } from 'lucide-react';
import api from '../services/api';

interface DashboardProps {
  user: any;
  teamId: number;
  onLogout: () => void;
}

function Dashboard({ user, teamId, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadTeamName = async () => {
      if (!teamId) {
        setTeamName('');
        return;
      }

      try {
        const teams = await api.getTeams();
        if (!isMounted) return;
        const currentTeam = Array.isArray(teams) ? teams.find((team: any) => team.id === teamId) : null;
        setTeamName(currentTeam?.name || '');
      } catch (error) {
        console.error('Failed to load team info:', error);
        if (isMounted) {
          setTeamName('');
        }
      }
    };

    loadTeamName();

    return () => {
      isMounted = false;
    };
  }, [teamId]);

  const menuItems = [
    {
      title: '早上打卡',
      description: '開始新的一天，打卡並規劃今日工作',
      icon: CheckSquare,
      path: '/checkin',
      color: '#10b981'
    },
    {
      title: '工作項目規劃 (Backlog)',
      description: '提早規劃工作項目，支援手動填寫或 AI 批量匯入',
      icon: Calendar,
      path: '/backlog',
      color: '#6366f1'
    },
    {
      title: '填寫工作項目',
      description: '使用 AI 對話輔助填寫今日工作項目',
      icon: MessageSquare,
      path: '/workitems',
      color: '#3b82f6'
    },
    {
      title: '站立會議 Review',
      description: 'AI 分析並分配團隊工作任務',
      icon: Users,
      path: '/standup-review',
      color: '#8b5cf6'
    },
    {
      title: '更新工作進度',
      description: '下班前更新今日工作進度',
      icon: TrendingUp,
      path: '/update-work',
      color: '#f59e0b'
    },
    {
      title: '每日總結',
      description: '查看 AI 產生的每日工作總結',
      icon: TrendingUp,
      path: '/daily-summary',
      color: '#ec4899'
    },
    {
      title: '週報管理',
      description: '產生和查看團隊週報，支援多種報表類型',
      icon: FileBarChart,
      path: '/weekly-reports',
      color: '#14b8a6'
    },
    {
      title: '團隊管理',
      description: '管理團隊成員和設定',
      icon: Settings,
      path: '/team-management',
      color: '#6b7280'
    }
  ];

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="header">
          <div>
            <h1 style={{ marginBottom: '8px' }}>工作儀表板</h1>
            <p style={{ color: '#6b7280' }}>
              歡迎，{user.displayName}
              {teamName && <> 來到{teamName}團隊</>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/teams')}>
              切換團隊
            </button>
            <button className="btn btn-secondary" onClick={onLogout}>
              <LogOut size={18} />
              登出
            </button>
          </div>
        </div>

        <div style={{ 
          display: 'grid', 
          gap: '24px', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          marginTop: '30px'
        }}>
          {menuItems.map((item) => (
            <div
              key={item.path}
              className="card"
              style={{ 
                cursor: 'pointer', 
                transition: 'all 0.3s ease',
                border: '2px solid transparent'
              }}
              onClick={() => navigate(item.path)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = item.color;
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'start', gap: '16px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: `${item.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <item.icon size={24} style={{ color: item.color }} />
                </div>
                <div>
                  <h3 style={{ marginBottom: '8px', color: '#1f2937' }}>
                    {item.title}
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: '1.5' }}>
                    {item.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: '40px', background: '#f9fafb' }}>
          <h3 style={{ marginBottom: '12px', color: '#374151' }}>使用流程</h3>
          <ol style={{ paddingLeft: '20px', color: '#6b7280', lineHeight: '2' }}>
            <li><strong>早上打卡：</strong>開始新的一天，記錄到班時間</li>
            <li><strong>填寫工作項目：</strong>透過 AI 對話，描述今日計劃完成的工作</li>
            <li><strong>站立會議 Review：</strong>團隊全員完成後，由管理員確認，AI 將分析並分配工作</li>
            <li><strong>更新工作進度：</strong>下班前更新今日工作完成狀況</li>
            <li><strong>每日總結：</strong>查看 AI 產生的總結，供明日會議參考</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
