import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, AlertCircle, Loader2, Send, Sparkles, ChevronDown, ChevronRight, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';

interface WorkItem {
  id: number;
  content: string;
  item_type: string;
  created_at: string;
  updated_at: string;
  checkin_id: number;
  user_id: number;
  team_id: number;
  checkin_date: string;
  session_id?: string;
  ai_summary?: string;
  ai_title?: string;
  username?: string;
  display_name?: string;
  progress_status?: string;
}

interface WorkUpdate {
  id: number;
  work_item_id: number;
  user_id: number;
  update_content: string;
  progress_status: string;
  updated_at: string;
  username: string;
  display_name: string;
}

function UpdateWork({ user, teamId }: any) {
  const navigate = useNavigate();
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [updateContent, setUpdateContent] = useState('');
  const [progressStatus, setProgressStatus] = useState('in_progress');
  const [updates, setUpdates] = useState<WorkUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isManager, setIsManager] = useState(false);
  const [viewAllMembers, setViewAllMembers] = useState(false);

  useEffect(() => {
    checkManagerRole();
    fetchTodayWorkItems();
  }, [teamId, viewAllMembers]);

  useEffect(() => {
    if (selectedItem) {
      fetchWorkUpdates(selectedItem);
    }
  }, [selectedItem]);

  const checkManagerRole = async () => {
    try {
      const members = await api.getTeamMembers(teamId);
      const currentMember = members.find((m: any) => m.user_id === user.id);
      setIsManager(currentMember?.role === 'admin');
    } catch (err) {
      console.error('檢查權限失敗:', err);
    }
  };

  const fetchTodayWorkItems = async () => {
    setLoading(true);
    setError('');
    try {
      // 如果是 Manager 且選擇查看所有成員
      const data = (isManager && viewAllMembers) 
        ? await api.getTodayTeamWorkItems(teamId)
        : await api.getTodayWorkItems(teamId);
      
      console.log('📋 載入的工作項目:', data); // Debug log
      setWorkItems(data);
      if (data.length > 0 && !selectedItem) {
        setSelectedItem(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || '載入工作項目失敗');
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkUpdates = async (itemId: number) => {
    try {
      const data = await api.getWorkItemUpdates(itemId);
      setUpdates(data);
      
      // 如果有更新記錄，用最新的狀態更新工作項目
      if (data.length > 0) {
        const latestStatus = data[0].progress_status;
        setWorkItems(prev => prev.map(item => 
          item.id === itemId ? { ...item, progress_status: latestStatus } : item
        ));
      }
    } catch (err: any) {
      console.error('載入更新記錄失敗:', err);
    }
  };

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !updateContent.trim()) {
      setError('請選擇工作項目並填寫更新內容');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await api.createWorkUpdate(selectedItem, {
        updateContent: updateContent.trim(),
        progressStatus
      });

      setSuccess('工作更新已提交！');
      setUpdateContent('');
      
      // 重新載入更新記錄（這會自動更新工作項目狀態）
      await fetchWorkUpdates(selectedItem);
      
      // 重新載入工作項目以獲取最新狀態
      await fetchTodayWorkItems();

      // 3 秒後清除成功訊息
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || '提交更新失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      not_started: { label: '未開始', class: 'badge-secondary', icon: Clock },
      in_progress: { label: '進行中', class: 'badge-warning', icon: Loader2 },
      completed: { label: '已完成', class: 'badge-success', icon: CheckCircle },
      blocked: { label: '受阻', class: 'badge-danger', icon: AlertCircle }
    };

    const config = statusConfig[status] || statusConfig.in_progress;
    const Icon = config.icon;

    return (
      <span className={`badge ${config.class}`}>
        <Icon size={14} style={{ marginRight: '4px' }} />
        {config.label}
      </span>
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
          <div>
            <h1>更新工作進度</h1>
            <p className="subtitle">下班前更新今日工作進度，讓團隊了解您的進展</p>
          </div>
          {isManager && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={viewAllMembers}
                  onChange={(e) => setViewAllMembers(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <span>查看所有成員進度</span>
              </label>
            </div>
          )}
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

        {workItems.length === 0 ? (
          <div className="card">
            <p style={{ textAlign: 'center', color: '#666' }}>
              今日尚無工作項目，請先到「工作項目輸入」頁面新增工作。
            </p>
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/workitems')}
              >
                前往新增工作項目
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
            {/* 左側：工作項目列表 */}
            <div className="card" style={{ position: 'sticky', top: '20px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
              <h3>今日工作項目</h3>
              <div style={{ marginTop: '15px' }}>
                {workItems.map((item) => {
                  const isSelected = selectedItem === item.id;
                  const assignee = item.display_name || item.username || (item.user_id === user.id ? user.username || user.display_name : '未指定');
                  const title = item.ai_title || (item.content.length > 50 ? item.content.slice(0, 50) + '...' : item.content);
                  
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item.id)}
                      style={{
                        padding: '12px',
                        marginBottom: '8px',
                        border: isSelected ? '2px solid #0066cc' : '1px solid #e0e0e0',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? '#f0f8ff' : '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px', lineHeight: '1.4' }}>
                        {title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '11px', color: '#666' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <User size={12} />
                          <span>{assignee}</span>
                        </div>
                        {item.progress_status && (
                          <div style={{ transform: 'scale(0.85)', transformOrigin: 'left' }}>
                            {getStatusBadge(item.progress_status)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右側：更新表單和歷史記錄 */}
            <div>
              {/* 工作項目詳細內容 */}
              {selectedItem && workItems.find(item => item.id === selectedItem) && (
                <div className="card" style={{ marginBottom: '20px' }}>
                  <h3>工作項目詳情</h3>
                  {(() => {
                    const item = workItems.find(i => i.id === selectedItem);
                    if (!item) return null;
                    
                    // Debug: 檢查項目資料
                    console.log('📝 選中的工作項目:', item);
                    
                    // 取得指派人員名稱
                    const assignee = item.display_name || item.username || 
                      (item.user_id === user.id ? (user.display_name || user.username || '我') : null) ||
                      '未指定';
                    
                    // 取得狀態 - 如果沒有狀態就顯示預設
                    const status = item.progress_status || 'in_progress';
                    
                    return (
                      <div style={{ marginTop: '15px' }}>
                        {/* 項目資訊標題列 */}
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px', 
                          marginBottom: '15px', 
                          paddingBottom: '12px',
                          borderBottom: '2px solid #e6e6e6',
                          flexWrap: 'wrap' 
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                            <User size={16} style={{ color: '#0066cc' }} />
                            <strong style={{ color: '#333' }}>{assignee}</strong>
                          </div>
                          <div>{getStatusBadge(status)}</div>
                          <span style={{ fontSize: '12px', color: '#999', marginLeft: 'auto' }}>
                            建立於 {formatTime(item.created_at)}
                          </span>
                        </div>
                          
                        {/* 完整內容 */}
                        <div style={{ 
                          padding: '14px',
                          backgroundColor: '#fafafa',
                          borderRadius: '6px',
                          marginBottom: '12px',
                          border: '1px solid #f0f0f0'
                        }}>
                          <div className="prose-sm markdown-content" style={{ fontSize: '14px', lineHeight: '1.7' }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                          </div>
                        </div>
                        
                        {/* AI 摘要 */}
                        {item.ai_summary && (
                          <div style={{ 
                            padding: '14px',
                            backgroundColor: '#f8f5ff',
                            borderRadius: '6px',
                            borderLeft: '3px solid #7c3aed'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                              <Sparkles size={14} style={{ color: '#7c3aed', marginRight: '6px' }} />
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#7c3aed' }}>AI 摘要</span>
                            </div>
                            <div className="prose-sm markdown-content" style={{ fontSize: '13px', lineHeight: '1.6', color: '#555' }}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.ai_summary}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 更新表單 */}
              <div className="card">
                <h3>新增進度更新</h3>
                <form onSubmit={handleSubmitUpdate} style={{ marginTop: '15px' }}>
                  <div className="form-group">
                    <label htmlFor="progress-status">進度狀態</label>
                    <select
                      id="progress-status"
                      className="form-control"
                      value={progressStatus}
                      onChange={(e) => setProgressStatus(e.target.value)}
                    >
                      <option value="not_started">未開始</option>
                      <option value="in_progress">進行中</option>
                      <option value="completed">已完成</option>
                      <option value="blocked">受阻</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="update-content">更新內容</label>
                    <textarea
                      id="update-content"
                      className="form-control"
                      rows={4}
                      placeholder="描述您的工作進展、遇到的問題、下一步計劃等..."
                      value={updateContent}
                      onChange={(e) => setUpdateContent(e.target.value)}
                      required
                    />
                    <div className="form-hint">
                      提示：詳細描述您的進展，包括完成了什麼、遇到什麼問題、需要什麼協助
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || !updateContent.trim()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={18} className="spinner" />
                        提交中...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        提交更新
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* 更新歷史 */}
              <div className="card" style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>更新歷史</h3>
                  {/* 顯示當前狀態 */}
                  {updates.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#666' }}>當前狀態:</span>
                      {getStatusBadge(updates[0].progress_status)}
                    </div>
                  )}
                </div>
                {updates.length === 0 ? (
                  <p style={{ color: '#666', marginTop: '15px' }}>尚無更新記錄</p>
                ) : (
                  <div style={{ marginTop: '15px' }}>
                    {updates.map((update, index) => (
                      <div
                        key={update.id}
                        style={{
                          padding: '15px',
                          marginBottom: '15px',
                          backgroundColor: index === 0 ? '#f0f8ff' : '#f8f9fa',
                          borderRadius: '8px',
                          borderLeft: index === 0 ? '4px solid #0066cc' : '4px solid #d0d0d0'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {index === 0 && <span style={{ fontSize: '11px', color: '#0066cc', fontWeight: '600' }}>最新</span>}
                            <span style={{ fontSize: '12px', color: '#666' }}>
                              {formatTime(update.updated_at)}
                            </span>
                          </div>
                          {/* 只在第一條（最新）顯示狀態變化 */}
                          {index === 0 && (
                            <div style={{ fontSize: '11px', color: '#666' }}>
                              更新狀態為: {getStatusBadge(update.progress_status)}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                          {update.update_content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UpdateWork;
