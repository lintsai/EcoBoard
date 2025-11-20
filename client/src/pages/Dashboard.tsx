import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Users, CheckSquare, MessageSquare, TrendingUp, Settings, Calendar, FileBarChart } from 'lucide-react';
import api from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';

interface DashboardProps {
  user: any;
  teamId: number;
  onLogout: () => void;
}

function Dashboard({ user, teamId, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState('');
  const threeColumnGrid = {
    display: 'grid',
    gap: '24px',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    alignItems: 'stretch'
  } as const;
  const planningItems = [
    {
      title: '工作項目規劃 (Backlog)',
      description: '提早規劃工作項目，支援手動填寫或 AI 批量匯入',
      icon: Calendar,
      path: '/backlog',
      color: '#6366f1'
    }
  ];

  const workflowItems = [
    {
      title: '早上打卡',
      description: '開始新的一天，打卡並規劃今日工作',
      icon: CheckSquare,
      path: '/checkin',
      color: '#10b981'
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
    }
  ];

  const managementItems = [
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

  return (
    <div className="app-container">
      <div className="main-content">
        <Breadcrumbs />
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

        <div style={{ marginTop: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
            <h2 style={{ margin: 0, color: '#111827', fontSize: '20px' }}>規劃與準備</h2>
            <span style={{ color: '#6b7280', fontSize: '13px' }}>先整理 Backlog，再展開每日節奏</span>
          </div>
          <div style={threeColumnGrid}>
            {planningItems.map((item) => (
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
        </div>

        <div style={{ marginTop: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
            <h2 style={{ margin: 0, color: '#111827', fontSize: '20px' }}>每日流程</h2>
            <span style={{ color: '#6b7280', fontSize: '13px' }}>依每日節奏排序，從打卡、追蹤到收尾</span>
          </div>
          <div style={threeColumnGrid}>
            {workflowItems.map((item) => (
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
        </div>

        <div style={{ marginTop: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
            <h2 style={{ margin: 0, color: '#111827', fontSize: '18px' }}>報表與管理</h2>
            <span style={{ color: '#6b7280', fontSize: '13px' }}>匯總績效、產出報表並管理團隊設定</span>
          </div>
          <div style={threeColumnGrid}>
            {managementItems.map((item) => (
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
        </div>

        <div className="card" style={{ marginTop: '40px', background: '#f9fafb' }}>
          <h3 style={{ marginBottom: '12px', color: '#374151' }}>💡 使用流程與小提示</h3>

          {/* 小提示區塊 */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #0891b2',
            borderRadius: '6px',
            marginBottom: '16px'
          }}>
            <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#6b7280' }}>
              <li><strong style={{ color: '#0f172a' }}>這是您的工作中樞</strong>，點擊任一功能卡片可快速進入對應頁面，減少多次點擊的麻煩。</li>
              <li>建議<strong style={{ color: '#2563eb' }}>週一先整理 Backlog</strong>，將本週需求拆解並填寫預計日期，後續每日打卡時能直接加入今日。</li>
              <li>每日流程依時間順序排列：<strong style={{ color: '#047857' }}>打卡 → 工作項目 → 站立會議 → 更新進度 → 每日總結</strong>，按此節奏可確保資料完整。</li>
              <li>切換團隊請點右上角<strong style={{ color: '#b91c1c' }}>「切換團隊」</strong>按鈕，各團隊資料完全獨立，不會互相干擾。</li>
            </ul>
          </div>

          {/* 流程說明 */}
          <ol style={{ paddingLeft: '20px', color: '#6b7280', lineHeight: '2' }}>
            <li><strong style={{ color: '#0f172a' }}>建立/整理 Backlog：</strong>提前把需求拆解、估時並指派，或用 <strong style={{ color: '#2563eb' }}>AI 批次匯入</strong>。</li>
            <li><strong style={{ color: '#0f172a' }}>早上打卡與定調：</strong>開始新的一天並同步重點，從 Backlog <strong style={{ color: '#2563eb' }}>挑選今日項目</strong>。</li>
            <li><strong style={{ color: '#0f172a' }}>填寫今日工作項目：</strong>用 AI 對話或 Backlog 清單產出卡片，補上 <strong style={{ color: '#b91c1c' }}>優先序</strong> 與 <strong style={{ color: '#2563eb' }}>預計時間</strong>。</li>
            <li><strong style={{ color: '#0f172a' }}>站立會議 Review：</strong>全員完成後檢閱，AI 彙整重點並提供 <strong style={{ color: '#2563eb' }}>再分配</strong> 建議，追蹤未到齊人數。</li>
            <li><strong style={{ color: '#0f172a' }}>執行中追蹤：</strong>隨時在工作卡 <strong style={{ color: '#2563eb' }}>更新進度/優先</strong> 或新增 <strong style={{ color: '#2563eb' }}>共同負責人</strong>。</li>
            <li><strong style={{ color: '#0f172a' }}>收尾與產出：</strong>下班前更新進度，查看 AI 每日總結；週末匯出 <strong style={{ color: '#2563eb' }}>週報/績效報表</strong>。</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
