import { useState, useEffect } from 'react';
import { X, Search, UserPlus, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../services/api';
import './AddMemberModal.css';

interface User {
  username: string;
  displayName: string;
  email?: string;
  dn: string;
}

interface AddMemberModalProps {
  teamId: number;
  existingMembers: any[];
  onClose: () => void;
  onSuccess: () => void;
}

function AddMemberModal({ teamId, existingMembers, onClose, onSuccess }: AddMemberModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [displayedUsers, setDisplayedUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 初始載入所有使用者
  useEffect(() => {
    const loadAllUsers = async () => {
      setInitialLoading(true);
      setError('');
      
      try {
        // 使用萬用字元搜尋所有使用者
        const users = await api.searchUsers('*');
        
        // 過濾掉已經是團隊成員的使用者
        const existingUsernames = existingMembers.map(m => m.username.toLowerCase());
        const filteredUsers = users.filter(
          (user: User) => !existingUsernames.includes(user.username.toLowerCase())
        );
        
        setAllUsers(filteredUsers);
        setDisplayedUsers(filteredUsers);
      } catch (err: any) {
        console.error('載入使用者失敗:', err);
        setError(err.response?.data?.error || '載入使用者列表失敗');
        setAllUsers([]);
        setDisplayedUsers([]);
      } finally {
        setInitialLoading(false);
      }
    };

    loadAllUsers();
  }, [existingMembers]);

  // 本地搜尋過濾
  useEffect(() => {
    if (searchTerm.trim().length === 0) {
      setDisplayedUsers(allUsers);
      return;
    }

    const lowerSearchTerm = searchTerm.toLowerCase();
    const filtered = allUsers.filter(user => 
      user.username.toLowerCase().includes(lowerSearchTerm) ||
      user.displayName.toLowerCase().includes(lowerSearchTerm) ||
      (user.email && user.email.toLowerCase().includes(lowerSearchTerm))
    );
    setDisplayedUsers(filtered);
  }, [searchTerm, allUsers]);

  // 切換選擇使用者
  const toggleUserSelection = (user: User) => {
    setSelectedUsers(prev => {
      const isSelected = prev.some(u => u.username === user.username);
      if (isSelected) {
        return prev.filter(u => u.username !== user.username);
      } else {
        return [...prev, user];
      }
    });
  };

  // 檢查使用者是否被選擇
  const isUserSelected = (user: User) => {
    return selectedUsers.some(u => u.username === user.username);
  };

  // 新增成員
  const handleAddMembers = async () => {
    if (selectedUsers.length === 0) {
      setError('請至少選擇一位使用者');
      return;
    }

    setAdding(true);
    setError('');
    setSuccess('');

    try {
      // 逐一新增成員
      const results = await Promise.allSettled(
        selectedUsers.map(user => api.addTeamMember(teamId, user.username))
      );

      // 統計成功和失敗
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (successful > 0) {
        setSuccess(`成功新增 ${successful} 位成員${failed > 0 ? `，${failed} 位失敗` : ''}`);
        setSelectedUsers([]);
        setSearchTerm('');
        
        // 延遲關閉以顯示成功訊息
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setError('所有成員新增失敗');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || '新增成員失敗');
    } finally {
      setAdding(false);
    }
  };

  // 移除已選擇的使用者
  const removeSelectedUser = (user: User) => {
    setSelectedUsers(prev => prev.filter(u => u.username !== user.username));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>新增團隊成員</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          {/* 搜尋框 */}
          <div className="search-section">
            <div className="search-input-wrapper">
              <Search size={20} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="搜尋使用者（輸入姓名或帳號）..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
              {initialLoading && <Loader2 size={20} className="search-loading spinner" />}
            </div>
            <div className="search-hint">
              {allUsers.length > 0 ? `共 ${allUsers.length} 位可加入的使用者${displayedUsers.length !== allUsers.length ? `，顯示 ${displayedUsers.length} 位` : ''}` : '載入使用者中...'}
            </div>
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div className="alert alert-error">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {/* 成功訊息 */}
          {success && (
            <div className="alert alert-success">
              <CheckCircle size={18} />
              {success}
            </div>
          )}

          {/* 已選擇的使用者 */}
          {selectedUsers.length > 0 && (
            <div className="selected-users-section">
              <div className="selected-users-header">
                已選擇 {selectedUsers.length} 位使用者
              </div>
              <div className="selected-users-list">
                {selectedUsers.map(user => (
                  <div key={user.username} className="selected-user-chip">
                    <div className="selected-user-avatar">
                      {user.displayName[0].toUpperCase()}
                    </div>
                    <div className="selected-user-info">
                      <div className="selected-user-name">{user.displayName}</div>
                      <div className="selected-user-username">@{user.username}</div>
                    </div>
                    <button
                      className="remove-selected-btn"
                      onClick={() => removeSelectedUser(user)}
                      title="移除"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 搜尋結果 */}
          <div className="search-results-section">
            {initialLoading ? (
              <div className="search-results-loading">
                <Loader2 size={40} className="spinner" />
                <p>載入使用者列表中...</p>
              </div>
            ) : displayedUsers.length === 0 ? (
              <div className="search-results-empty">
                <AlertCircle size={48} style={{ color: '#ccc' }} />
                <p>{searchTerm ? '找不到符合的使用者' : '沒有可加入的使用者'}</p>
              </div>
            ) : (
              <div className="search-results-list">
                {displayedUsers.map(user => (
                  <div
                    key={user.username}
                    className={`search-result-item ${isUserSelected(user) ? 'selected' : ''}`}
                    onClick={() => toggleUserSelection(user)}
                  >
                    <div className="search-result-checkbox">
                      <input
                        type="checkbox"
                        checked={isUserSelected(user)}
                        onChange={() => {}}
                      />
                    </div>
                    <div className="search-result-avatar">
                      {user.displayName[0].toUpperCase()}
                    </div>
                    <div className="search-result-info">
                      <div className="search-result-name">{user.displayName}</div>
                      <div className="search-result-username">@{user.username}</div>
                      {user.email && (
                        <div className="search-result-email">{user.email}</div>
                      )}
                    </div>
                    {isUserSelected(user) && (
                      <CheckCircle size={20} className="search-result-check" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={adding}
          >
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleAddMembers}
            disabled={adding || selectedUsers.length === 0}
          >
            {adding ? (
              <>
                <Loader2 size={18} className="spinner" />
                新增中...
              </>
            ) : (
              <>
                <UserPlus size={18} />
                新增 {selectedUsers.length > 0 && `(${selectedUsers.length})`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddMemberModal;
