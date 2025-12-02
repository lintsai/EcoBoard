import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Users, Plus, LogOut } from 'lucide-react';
import api from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';
import { sanitizeRedirectPath } from '../utils/redirect';
import { storeSelectedTeam, withTeamQuery } from '../utils/teamSelection';

interface TeamSelectProps {
  user: any;
  onLogout: () => void;
  onSelectTeam: (teamId: number | null) => void;
}

function TeamSelect({ user, onLogout, onSelectTeam }: TeamSelectProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [teams, setTeams] = useState<any[]>([]);
  const [discoverableTeams, setDiscoverableTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  useEffect(() => {
    loadTeams();
    loadDiscoverableTeams();
  }, []);

  const loadTeams = async () => {
    setLoading(true);
    try {
      const data = await api.getTeams();
      setTeams(data);
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDiscoverableTeams = async () => {
    setDiscoverLoading(true);
    try {
      const data = await api.getDiscoverableTeams();
      setDiscoverableTeams(data);
    } catch (error) {
      console.error('Failed to load discoverable teams:', error);
      setDiscoverableTeams([]);
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createTeam(newTeamName, newTeamDesc);
      setNewTeamName('');
      setNewTeamDesc('');
      setShowCreateForm(false);
      loadTeams();
      loadDiscoverableTeams();
    } catch (error) {
      console.error('Failed to create team:', error);
      alert('建立團隊失敗');
    }
  };

  const resolveRedirectTarget = (nextTeamId: number) => {
    const params = new URLSearchParams(location.search);
    const redirectParam = sanitizeRedirectPath(params.get('redirect'));
    const postTeam = sanitizeRedirectPath(sessionStorage.getItem('postTeamRedirect'));
    const postLogin = sanitizeRedirectPath(sessionStorage.getItem('postLoginRedirect'));
    const fromState = sanitizeRedirectPath(
      (location.state as { from?: string } | null)?.from || null
    );
    const target = redirectParam || postTeam || postLogin || fromState || '/dashboard';
    return withTeamQuery(target, nextTeamId);
  };

  const handleSelectTeam = (teamId: number) => {
    onSelectTeam(teamId);
    storeSelectedTeam(teamId, user?.id);
    const target = resolveRedirectTarget(teamId);
    sessionStorage.removeItem('postTeamRedirect');
    sessionStorage.removeItem('postLoginRedirect');
    navigate(target);
  };

  const handleLogout = () => {
    const confirmed = window.confirm('確定要登出並返回登入頁嗎？');
    if (confirmed) {
      onLogout();
    }
  };

  return (
    <div className="app-container">
      <div className="main-content">
        <Breadcrumbs />
        <div className="header">
          <div>
            <h1 style={{ marginBottom: '8px' }}>選擇團隊</h1>
            <p style={{ color: '#6b7280', maxWidth: '760px', lineHeight: '1.6' }}>
              歡迎來到 EcoBoard，這是一個 AI 助力的團隊工作儀表板，協助站立會議、Backlog 規劃與進度追蹤。
              {user?.displayName ? ` ${user.displayName}，請選擇要進入的團隊。` : ' 請選擇要進入的團隊。'}
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="loading" style={{ width: 40, height: 40, margin: '0 auto' }}></div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ color: '#374151' }}>我的團隊</h2>
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateForm(!showCreateForm)}
              >
                <Plus size={18} />
                建立新團隊
              </button>
            </div>

            {showCreateForm && (
              <div className="card" style={{ marginBottom: '24px', background: '#f9fafb' }}>
                <h3 style={{ marginBottom: '16px' }}>建立新團隊</h3>
                <form onSubmit={handleCreateTeam}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                      團隊名稱
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                      描述（選填）
                    </label>
                    <textarea
                      className="textarea"
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      style={{ minHeight: '80px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="submit" className="btn btn-primary">
                      建立
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowCreateForm(false)}
                    >
                      取消
                    </button>
                  </div>
                </form>
              </div>
            )}

            {teams.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <Users size={48} style={{ color: '#d1d5db', margin: '0 auto 16px' }} />
                <p style={{ color: '#6b7280', marginBottom: '20px' }}>
                  您還沒有加入任何團隊
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowCreateForm(true)}
                >
                  <Plus size={18} />
                  建立第一個團隊
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="card"
                    style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
                    onClick={() => handleSelectTeam(team.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Users size={24} style={{ color: '#667eea' }} />
                        <h3 style={{ margin: 0 }}>{team.name}</h3>
                      </div>
                      {team.role === 'admin' && (
                        <span style={{
                          background: '#667eea',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600
                        }}>
                          管理員
                        </span>
                      )}
                    </div>
                    {team.description && (
                      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '12px' }}>
                        {team.description}
                      </p>
                    )}
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      加入於 {new Date(team.joined_at).toLocaleDateString('zh-TW')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card" style={{ marginTop: '24px', background: '#f9fafb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#374151' }}>尚未加入的團隊</h3>
                  <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '6px', lineHeight: '1.6' }}>
                    瀏覽其他團隊，若想加入可請該團隊管理員邀請你，或由他們在「團隊管理」新增成員。
                  </p>
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={loadDiscoverableTeams}
                  disabled={discoverLoading}
                >
                  {discoverLoading ? '載入中...' : '重新整理'}
                </button>
              </div>
              {discoverLoading ? (
                <div style={{ textAlign: 'center', padding: '12px 0', color: '#9ca3af' }}>載入中...</div>
              ) : discoverableTeams.length === 0 ? (
                <p style={{ color: '#6b7280', margin: 0 }}>
                  目前沒有其他可探索的團隊，或是您已在所有相關團隊中。也可以直接建立一個新團隊並邀請同事。
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                  {discoverableTeams.map((team) => {
                    const createdAt = team.created_at || team.createdAt;
                    const createdAtLabel = createdAt ? new Date(createdAt).toLocaleDateString('zh-TW') : '—';
                    const memberCount = team.member_count ?? team.memberCount ?? 0;
                    const adminName =
                      team.admin_display_name ||
                      team.adminDisplayName ||
                      team.admin_username ||
                      team.adminUsername ||
                      '—';
                    return (
                      <div
                        key={team.id}
                        style={{
                          padding: '12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          background: '#fff'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Users size={18} style={{ color: '#667eea' }} />
                            <div>
                              <div style={{ fontWeight: 600, color: '#111827' }}>{team.name}</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                {memberCount} 位成員
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                            建立於 {createdAtLabel}
                          </span>
                        </div>
                        {team.description && (
                          <p style={{ color: '#4b5563', fontSize: '13px', marginTop: '8px', lineHeight: '1.5' }}>
                            {team.description}
                          </p>
                        )}
                        <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '6px' }}>
                          管理員：{adminName}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                          如需加入，請聯繫該團隊管理員邀請你或協助新增成員。
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card" style={{ marginTop: '24px', background: '#f9fafb' }}>
              <h3 style={{ marginBottom: '10px', color: '#374151' }}>💡 使用小提示</h3>
              <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#6b7280' }}>
                <li><strong style={{ color: '#0f172a' }}>切換團隊</strong>時，各團隊的打卡、工作項目與報表<strong style={{ color: '#2563eb' }}>完全獨立</strong>，不會互相覆蓋或混淆。</li>
                <li>想加入其他團隊請在「尚未加入的團隊」區塊找到<strong style={{ color: '#047857' }}>管理員名稱並聯繫對方</strong>，由管理員在「團隊管理」頁面新增您。</li>
                <li>建立新團隊後，點擊「團隊管理」可設定描述、<strong style={{ color: '#2563eb' }}>新增成員並指定管理員權限</strong>（建議至少 2 位管理員）。</li>
                <li>剛開始使用？可先<strong style={{ color: '#b91c1c' }}>建立測試團隊</strong>練習打卡、填寫工作項目、生成報表，熟悉後再邀請正式團隊成員。</li>
              </ul>
            </div>
          </>
        )}

        <div className="logout-panel">
          <button className="btn btn-danger logout-full-button" onClick={handleLogout}>
            <LogOut size={18} />
            登出並離開
          </button>
          <p className="logout-hint">
            登出只會在此顯示，點擊後系統會清除登入資訊並跳回登入頁。
          </p>
        </div>
      </div>
    </div>
  );
}

export default TeamSelect;
