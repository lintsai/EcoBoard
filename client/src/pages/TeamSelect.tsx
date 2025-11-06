import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, LogOut, Settings } from 'lucide-react';
import api from '../services/api';

interface TeamSelectProps {
  user: any;
  onLogout: () => void;
  onSelectTeam: (teamId: number) => void;
}

function TeamSelect({ user, onLogout, onSelectTeam }: TeamSelectProps) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const data = await api.getTeams();
      setTeams(data);
    } catch (error) {
      console.error('Failed to load teams:', error);
    } finally {
      setLoading(false);
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
    } catch (error) {
      console.error('Failed to create team:', error);
      alert('建立團隊失敗');
    }
  };

  const handleSelectTeam = (teamId: number) => {
    onSelectTeam(teamId);
    navigate('/dashboard');
  };

  return (
    <div className="app-container">
      <div className="main-content">
        <div className="header">
          <div>
            <h1 style={{ marginBottom: '8px' }}>選擇團隊</h1>
            <p style={{ color: '#6b7280' }}>歡迎，{user.displayName}</p>
          </div>
          <button className="btn btn-secondary" onClick={onLogout}>
            <LogOut size={18} />
            登出
          </button>
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
          </>
        )}
      </div>
    </div>
  );
}

export default TeamSelect;
