import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, UserPlus, Shield, Clock, Trash2, Loader2, CheckCircle, AlertCircle, Edit2, Save, X } from 'lucide-react';
import api from '../services/api';

interface TeamMember {
  user_id: number;
  username: string;
  display_name: string;
  role: string;
  joined_at: string;
}

interface Team {
  id: number;
  name: string;
  description: string;
}

function TeamManagement({ user, teamId, onTeamUpdate }: any) {
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingTeam, setEditingTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');

  useEffect(() => {
    if (teamId) {
      loadTeamData();
      loadTeamMembers();
    }
  }, [teamId]);

  const loadTeamData = async () => {
    try {
      const teams = await api.getTeams();
      const currentTeam = teams.find((t: Team) => t.id === teamId);
      if (currentTeam) {
        setTeam(currentTeam);
        setTeamName(currentTeam.name);
        setTeamDescription(currentTeam.description || '');
      }
    } catch (err: any) {
      console.error('Failed to load team data:', err);
    }
  };

  const loadTeamMembers = async () => {
    setLoading(true);
    setError('');
    
    try {
      const data = await api.getTeamMembers(teamId);
      setMembers(data);
    } catch (err: any) {
      setError(err.message || '載入團隊成員失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMemberUsername.trim()) {
      setError('請輸入使用者帳號');
      return;
    }

    setAdding(true);
    setError('');
    setSuccess('');

    try {
      await api.addTeamMember(teamId, newMemberUsername.trim());
      setSuccess(`成功新增成員：${newMemberUsername}`);
      setNewMemberUsername('');
      setShowAddMember(false);
      
      await loadTeamMembers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || '新增成員失敗');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (memberId: number, memberName: string) => {
    if (!confirm(`確定要移除成員 ${memberName} 嗎？`)) return;

    setError('');
    setSuccess('');
    
    try {
      await api.removeTeamMember(teamId, memberId);
      setSuccess(`已移除成員：${memberName}`);
      await loadTeamMembers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || '移除成員失敗');
    }
  };

  const handleToggleRole = async (memberId: number, currentRole: string, memberName: string) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    const action = newRole === 'admin' ? '升級為管理員' : '降級為一般成員';
    
    if (!confirm(`確定要將 ${memberName} ${action}嗎？`)) return;

    setError('');
    setSuccess('');
    
    try {
      await api.updateMemberRole(teamId, memberId, newRole);
      setSuccess(`已將 ${memberName} ${action}`);
      await loadTeamMembers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || '更新角色失敗');
    }
  };

  const handleUpdateTeam = async () => {
    if (!teamName.trim()) {
      setError('團隊名稱不能為空');
      return;
    }

    setError('');
    setSuccess('');
    
    try {
      await api.updateTeam(teamId, { name: teamName.trim(), description: teamDescription.trim() });
      setSuccess('團隊資訊已更新');
      setEditingTeam(false);
      await loadTeamData();
      if (onTeamUpdate) onTeamUpdate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || '更新團隊失敗');
    }
  };

  const handleDeleteTeam = async () => {
    if (!confirm(`確定要刪除團隊「${team?.name}」嗎？\n\n此操作無法復原，將刪除所有相關資料（成員、打卡、工作項目等）`)) return;

    setError('');
    
    try {
      await api.deleteTeam(teamId);
      alert('團隊已刪除');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || '刪除團隊失敗');
    }
  };

  const getRoleBadge = (role: string) => {
    if (role === 'admin') {
      return (
        <span className="badge badge-primary">
          <Shield size={14} />
          管理員
        </span>
      );
    }
    return (
      <span className="badge badge-secondary">
        <Users size={14} />
        成員
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const isCurrentUserAdmin = members.find(m => m.user_id === user?.id)?.role === 'admin';

  // Debug: 檢查權限判斷
  useEffect(() => {
    if (members.length > 0 && user) {
      console.log('=== Team Management Debug ===');
      console.log('Current user:', user);
      console.log('Current user ID:', user?.id, typeof user?.id);
      console.log('Team members:', members);
      console.log('Current member:', members.find(m => m.user_id === user?.id));
      console.log('Is admin:', isCurrentUserAdmin);
      console.log('===========================');
    }
  }, [members, user, isCurrentUserAdmin]);

  if (loading) {
    return (
      <div className="app-container">
        <div className="main-content">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Loader2 size={40} className="spinner" />
            <p>載入中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} />
          返回
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            {editingTeam ? (
              <div>
                <input
                  type="text"
                  className="form-control"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="團隊名稱"
                  style={{ marginBottom: '10px', fontSize: '24px', fontWeight: 'bold' }}
                />
                <textarea
                  className="form-control"
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                  placeholder="團隊描述（選填）"
                  rows={2}
                  style={{ fontSize: '14px' }}
                />
              </div>
            ) : (
              <>
                <h1>{team?.name || '團隊管理'}</h1>
                <p className="subtitle">{team?.description || '管理團隊成員和權限設定'}</p>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginLeft: '20px' }}>
            {isCurrentUserAdmin && (
              <>
                {editingTeam ? (
                  <>
                    <button className="btn btn-success" onClick={handleUpdateTeam}>
                      <Save size={18} />
                      儲存
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditingTeam(false);
                        setTeamName(team?.name || '');
                        setTeamDescription(team?.description || '');
                      }}
                    >
                      <X size={18} />
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-secondary" onClick={() => setEditingTeam(true)}>
                      <Edit2 size={18} />
                      編輯團隊
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowAddMember(!showAddMember)}
                    >
                      <UserPlus size={18} />
                      新增成員
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={handleDeleteTeam}
                      title="刪除團隊"
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <CheckCircle size={18} />
            {success}
          </div>
        )}

        {/* 新增成員表單 */}
        {showAddMember && isCurrentUserAdmin && (
          <div className="card" style={{ marginBottom: '20px', backgroundColor: '#f8f9fa' }}>
            <h3 style={{ marginBottom: '15px' }}>新增團隊成員</h3>
            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label htmlFor="username">使用者帳號（LDAP 帳號）</label>
                <input
                  type="text"
                  id="username"
                  className="form-control"
                  placeholder="請輸入 LDAP 帳號，例如：john.doe"
                  value={newMemberUsername}
                  onChange={(e) => setNewMemberUsername(e.target.value)}
                  required
                />
                <div className="form-hint">
                  輸入要新增的使用者 LDAP 帳號，該使用者必須是有效的 LDAP 帳號
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={adding}
                >
                  {adding ? (
                    <>
                      <Loader2 size={18} className="spinner" />
                      新增中...
                    </>
                  ) : (
                    <>
                      <UserPlus size={18} />
                      確認新增
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAddMember(false);
                    setNewMemberUsername('');
                    setError('');
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 成員統計 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#e3f2fd' }}>
              <Users size={24} style={{ color: '#0066cc' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">總成員數</div>
              <div className="stat-value">{members.length}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#f3e5f5' }}>
              <Shield size={24} style={{ color: '#9c27b0' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">管理員</div>
              <div className="stat-value">
                {members.filter(m => m.role === 'admin').length}
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#e8f5e9' }}>
              <Users size={24} style={{ color: '#4caf50' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">一般成員</div>
              <div className="stat-value">
                {members.filter(m => m.role === 'member').length}
              </div>
            </div>
          </div>
        </div>

        {/* 成員列表 */}
        <div className="card">
          <h3>團隊成員列表</h3>
          {members.length === 0 ? (
            <p style={{ color: '#666', marginTop: '15px' }}>團隊暫無成員</p>
          ) : (
            <div style={{ marginTop: '15px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>成員</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>角色</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600 }}>加入日期</th>
                    {isCurrentUserAdmin && (
                      <th style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr
                      key={member.user_id}
                      style={{
                        borderBottom: '1px solid #f0f0f0',
                        backgroundColor: member.user_id === user?.id ? '#f0f8ff' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '50%',
                              backgroundColor: '#0066cc',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontWeight: 'bold',
                              fontSize: '16px'
                            }}
                          >
                            {member.display_name?.[0] || member.username[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: '15px' }}>
                              {member.display_name || member.username}
                              {member.user_id === user?.id && (
                                <span style={{ marginLeft: '8px', fontSize: '13px', color: '#0066cc' }}>
                                  (您)
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '13px', color: '#666' }}>
                              @{member.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {getRoleBadge(member.role)}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#666' }}>
                          <Clock size={14} />
                          {formatDate(member.joined_at)}
                        </div>
                      </td>
                      {isCurrentUserAdmin && (
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            {member.user_id !== user?.id && (
                              <>
                                <button
                                  className={`btn btn-sm ${member.role === 'admin' ? 'btn-secondary' : 'btn-primary'}`}
                                  style={{ padding: '6px 12px', fontSize: '13px' }}
                                  onClick={() => handleToggleRole(member.user_id, member.role, member.display_name || member.username)}
                                  title={member.role === 'admin' ? '降級為成員' : '升級為管理員'}
                                >
                                  <Shield size={14} />
                                  {member.role === 'admin' ? '降級' : '升級'}
                                </button>
                                <button
                                  className="btn btn-sm btn-danger"
                                  style={{ padding: '6px 12px', fontSize: '13px' }}
                                  onClick={() => handleRemoveMember(member.user_id, member.display_name || member.username)}
                                  title="移除成員"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                            {member.user_id === user?.id && (
                              <span style={{ fontSize: '12px', color: '#999' }}>—</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 權限說明 */}
        <div className="card" style={{ marginTop: '20px', backgroundColor: '#f8f9fa' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>💡 功能說明</h3>
          <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#666' }}>
            <div style={{ marginBottom: '10px' }}>
              <strong style={{ color: '#0066cc' }}>管理員權限：</strong>
              <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
                <li>編輯團隊資訊（名稱、描述）</li>
                <li>新增/移除團隊成員</li>
                <li>升級/降級成員角色</li>
                <li>刪除團隊（⚠️ 慎用）</li>
                <li>查看所有成員的工作項目</li>
              </ul>
            </div>
            <div>
              <strong style={{ color: '#666' }}>一般成員權限：</strong>
              <ul style={{ paddingLeft: '20px', margin: '5px 0' }}>
                <li>每日打卡和填寫工作項目</li>
                <li>更新自己的工作進度</li>
                <li>查看團隊成員和工作狀況</li>
              </ul>
            </div>
            <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fff3cd', borderRadius: '4px', border: '1px solid #ffc107' }}>
              <strong style={{ color: '#856404' }}>⚠️ 注意事項：</strong>
              <ul style={{ paddingLeft: '20px', margin: '5px 0', color: '#856404' }}>
                <li>一個團隊可以有多個管理員</li>
                <li>無法移除自己（需由其他管理員操作）</li>
                <li>刪除團隊將永久刪除所有相關資料</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamManagement;
