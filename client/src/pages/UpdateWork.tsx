import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, AlertCircle, Loader2, Send, Sparkles, ChevronDown, ChevronRight, ChevronUp, User, X } from 'lucide-react';
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
  priority?: number;
  estimated_date?: string;
  session_id?: string;
  ai_summary?: string;
  ai_title?: string;
  username?: string;
  display_name?: string;
  progress_status?: string;
  handlers?: {
    primary: {
      user_id: number;
      username: string;
      display_name: string;
    } | null;
    co_handlers: Array<{
      user_id: number;
      username: string;
      display_name: string;
    }>;
  };
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
  const [incompleteItems, setIncompleteItems] = useState<WorkItem[]>([]);
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
  const [showIncomplete, setShowIncomplete] = useState(true);
  const [enlargedTable, setEnlargedTable] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'priority' | 'estimated_date'>('priority');

  // Helper function to get priority badge
  const getPriorityBadge = (priority: number = 3) => {
    const priorityConfig: Record<number, { label: string; emoji: string; color: string }> = {
      1: { label: '最高', emoji: '🔴', color: '#dc2626' },
      2: { label: '高', emoji: '🟠', color: '#ea580c' },
      3: { label: '中', emoji: '🟡', color: '#ca8a04' },
      4: { label: '低', emoji: '🟢', color: '#16a34a' },
      5: { label: '最低', emoji: '🔵', color: '#2563eb' }
    };
    
    const config = priorityConfig[priority] || priorityConfig[3];
    return (
      <span style={{ 
        fontSize: '11px', 
        color: config.color,
        fontWeight: '600',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px'
      }}>
        {config.emoji} {config.label}
      </span>
    );
  };

  // Sorting function
  const sortItems = <T extends WorkItem>(items: T[]): T[] => {
    const sorted = [...items];
    
    if (sortBy === 'priority') {
      sorted.sort((a, b) => (a.priority || 3) - (b.priority || 3));
    } else {
      // Sort by estimated_date: items without date go to bottom
      sorted.sort((a, b) => {
        if (!a.estimated_date && !b.estimated_date) return (a.priority || 3) - (b.priority || 3);
        if (!a.estimated_date) return 1;
        if (!b.estimated_date) return -1;
        return new Date(a.estimated_date).getTime() - new Date(b.estimated_date).getTime();
      });
    }
    
    return sorted;
  };

  useEffect(() => {
    checkManagerRole();
    fetchTodayWorkItems();
    fetchIncompleteWorkItems();
  }, [teamId, viewAllMembers]);

  useEffect(() => {
    // Add table click handler
    const handleTableClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const table = target.closest('.markdown-content table');
      if (table && !target.closest('.table-modal-content')) {
        e.preventDefault();
        e.stopPropagation();
        const tableHTML = (table as HTMLElement).outerHTML;
        setEnlargedTable(tableHTML);
      }
    };

    // Add ESC key handler
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnlargedTable(null);
      }
    };

    document.addEventListener('click', handleTableClick);
    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('click', handleTableClick);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, []);

  useEffect(() => {
    if (selectedItem) {
      fetchWorkUpdates(selectedItem);
      
      // 自動設置進度狀態為當前項目的狀態
      const item = [...workItems, ...incompleteItems].find(i => i.id === selectedItem);
      if (item?.progress_status) {
        setProgressStatus(item.progress_status);
      } else {
        setProgressStatus('in_progress'); // 預設為進行中
      }
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

  const fetchIncompleteWorkItems = async () => {
    try {
      // 如果是 Manager 且選擇查看所有成員
      const data = (isManager && viewAllMembers) 
        ? await api.getIncompleteTeamWorkItems(teamId)
        : await api.getIncompleteWorkItems(teamId);
      
      console.log('🔄 載入的未完成項目:', data); // Debug log
      
      // Backend now filters out today's items automatically
      setIncompleteItems(data);
    } catch (err: any) {
      console.error('載入未完成項目失敗:', err);
    }
  };

  const fetchWorkUpdates = async (itemId: number) => {
    try {
      const data = await api.getWorkItemUpdates(itemId);
      setUpdates(data);
    } catch (err: any) {
      console.error('載入更新記錄失敗:', err);
    }
  };

  const handleSubmitUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🚀 handleSubmitUpdate 被調用');
    console.log('📋 selectedItem:', selectedItem);
    console.log('📝 updateContent:', updateContent);
    console.log('📊 progressStatus:', progressStatus);
    
    if (!selectedItem || !updateContent.trim()) {
      console.log('❌ 驗證失敗：缺少必要資訊');
      setError('請選擇工作項目並填寫更新內容');
      return;
    }

    // 檢查用戶權限
    const item = [...workItems, ...incompleteItems].find(i => i.id === selectedItem);
    if (!item) {
      setError('找不到該工作項目');
      return;
    }

    const isPrimary = item.handlers?.primary?.user_id === user.id;
    const isCoHandler = item.handlers?.co_handlers?.some(h => h.user_id === user.id);
    
    if (!isPrimary && !isCoHandler) {
      setError('您不是此工作項目的處理人，無法更新');
      return;
    }

    // 共同處理人不能將工作標記為完成或取消
    if (!isPrimary && (progressStatus === 'completed' || progressStatus === 'cancelled')) {
      setError('只有主要處理人可以將工作標記為完成或取消');
      return;
    }

    console.log('✅ 開始提交更新...');
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      // 提交更新
      console.log('📤 發送 API 請求...');
      await api.createWorkUpdate(selectedItem, {
        updateContent: updateContent.trim(),
        progressStatus
      });
      console.log('✅ API 請求成功');
      console.log('✅ API 請求成功');

      setSuccess('工作更新已提交！');
      setUpdateContent('');
      
      // 先立即更新本地狀態，給用戶即時反饋
      console.log('🔄 更新本地狀態...');
      const updateLocalStatus = (items: WorkItem[]) => 
        items.map(item => 
          item.id === selectedItem ? { ...item, progress_status: progressStatus } : item
        );
      
      setWorkItems(prev => updateLocalStatus(prev));
      setIncompleteItems(prev => updateLocalStatus(prev));
      
      // 重新載入更新記錄 - 確保顯示最新的更新
      console.log('📥 重新載入更新記錄...');
      fetchWorkUpdates(selectedItem);
      
      // 延遲重新載入以確保資料庫已更新
      setTimeout(async () => {
        try {
          console.log('📥 重新載入工作項目...');
          await Promise.all([
            fetchTodayWorkItems(),
            fetchIncompleteWorkItems()
          ]);
          console.log('✅ 工作項目重新載入完成');
        } catch (err) {
          console.error('❌ 重新載入工作項目失敗:', err);
        }
      }, 500);

      // 3 秒後清除成功訊息
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('❌ 提交更新失敗:', err);
      setError(err.message || '提交更新失敗');
    } finally {
      console.log('🏁 提交流程結束');
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: any = {
      not_started: { label: '未開始', class: 'badge-secondary', icon: Clock },
      in_progress: { label: '進行中', class: 'badge-warning', icon: Loader2 },
      completed: { label: '已完成', class: 'badge-success', icon: CheckCircle },
      blocked: { label: '受阻', class: 'badge-danger', icon: AlertCircle },
      cancelled: { label: '已取消', class: 'badge-dark', icon: X }
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

        {/* Table Modal */}
        {enlargedTable && (
          <div className="table-modal-overlay" onClick={() => setEnlargedTable(null)}>
            <div className="table-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="table-modal-close" onClick={() => setEnlargedTable(null)}>
                ×
              </button>
              <div dangerouslySetInnerHTML={{ __html: enlargedTable }} />
              <div className="table-modal-hint">
                💡 點擊外部區域、按 ESC 鍵或 × 按鈕關閉
              </div>
            </div>
          </div>
        )}

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

        {workItems.length === 0 && incompleteItems.length === 0 ? (
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
              <h3>工作項目</h3>
              
              {/* 今日工作項目 */}
              {workItems.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ fontSize: '14px', color: '#0066cc', margin: 0 }}>今日項目 ({workItems.length})</h4>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSortBy(sortBy === 'priority' ? 'estimated_date' : 'priority');
                      }}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        borderRadius: '3px',
                        border: '1px solid #0066cc',
                        backgroundColor: '#0066cc',
                        color: '#fff',
                        cursor: 'pointer'
                      }}
                      title="點擊切換排序方式"
                    >
                      {sortBy === 'priority' ? '🔢' : '📅'}
                    </button>
                  </div>
                  {sortItems(workItems).map((item) => {
                    const isSelected = selectedItem === item.id;
                    const primaryHandler = item.handlers?.primary;
                    const coHandlers = item.handlers?.co_handlers || [];
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
                          {getPriorityBadge(item.priority)}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <User size={12} />
                            <span style={{ fontWeight: '600', color: '#667eea' }}>
                              {primaryHandler ? (primaryHandler.display_name || primaryHandler.username) : '未指定'}
                            </span>
                          </div>
                          {coHandlers.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: '#999' }}>+</span>
                              <span style={{ color: '#6b7280' }}>
                                {coHandlers.map(h => h.display_name || h.username).join(', ')}
                              </span>
                            </div>
                          )}
                          <span style={{ fontSize: '11px', color: item.estimated_date ? '#0891b2' : '#999' }}>
                            📅 {item.estimated_date 
                              ? (() => {
                                  const dateStr = typeof item.estimated_date === 'string' && item.estimated_date.includes('T') 
                                    ? item.estimated_date.split('T')[0] 
                                    : item.estimated_date;
                                  const [year, month, day] = dateStr.split('-');
                                  return `${parseInt(month)}/${parseInt(day)}`;
                                })()
                              : '未設定'}
                          </span>
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
              )}
              
              {/* 未完成的過往項目 */}
              {incompleteItems.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h4 style={{ fontSize: '14px', color: '#f59e0b', margin: 0 }}>
                      未完成項目 ({incompleteItems.length})
                    </h4>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSortBy(sortBy === 'priority' ? 'estimated_date' : 'priority');
                        }}
                        style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          borderRadius: '3px',
                          border: '1px solid #f59e0b',
                          backgroundColor: '#f59e0b',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                        title="點擊切換排序方式"
                      >
                        {sortBy === 'priority' ? '🔢' : '📅'}
                      </button>
                      <button
                        onClick={() => setShowIncomplete(!showIncomplete)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#666',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        {showIncomplete ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </div>
                  </div>
                  
                  {showIncomplete && sortItems(incompleteItems).map((item) => {
                    const isSelected = selectedItem === item.id;
                    const primaryHandler = item.handlers?.primary;
                    const coHandlers = item.handlers?.co_handlers || [];
                    const title = item.ai_title || (item.content.length > 50 ? item.content.slice(0, 50) + '...' : item.content);
                    const itemDate = new Date(item.checkin_date).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
                    
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedItem(item.id)}
                        style={{
                          padding: '12px',
                          marginBottom: '8px',
                          border: isSelected ? '2px solid #f59e0b' : '1px solid #fef3c7',
                          borderRadius: '8px',
                          backgroundColor: isSelected ? '#fffbeb' : '#fefce8',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '6px', lineHeight: '1.4' }}>
                          {title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '11px', color: '#666' }}>
                          {getPriorityBadge(item.priority)}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <User size={12} />
                            <span style={{ fontWeight: '600', color: '#f59e0b' }}>
                              {primaryHandler ? (primaryHandler.display_name || primaryHandler.username) : '未指定'}
                            </span>
                          </div>
                          {coHandlers.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: '#999' }}>+</span>
                              <span style={{ color: '#92400e' }}>
                                {coHandlers.map(h => h.display_name || h.username).join(', ')}
                              </span>
                            </div>
                          )}
                          <span style={{ color: '#f59e0b' }}>📅 {itemDate}</span>
                          <span style={{ fontSize: '11px', color: item.estimated_date ? '#0891b2' : '#999' }}>
                            📅 {item.estimated_date 
                              ? (() => {
                                  const dateStr = typeof item.estimated_date === 'string' && item.estimated_date.includes('T') 
                                    ? item.estimated_date.split('T')[0] 
                                    : item.estimated_date;
                                  const [year, month, day] = dateStr.split('-');
                                  return `${parseInt(month)}/${parseInt(day)}`;
                                })()
                              : '未設定'}
                          </span>
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
              )}
            </div>

            {/* 右側：更新表單和歷史記錄 */}
            <div>
              {/* 工作項目詳細內容 */}
              {selectedItem && [...workItems, ...incompleteItems].find(item => item.id === selectedItem) && (
                <div className="card" style={{ marginBottom: '20px' }}>
                  <h3>工作項目詳情</h3>
                  {(() => {
                    const item = [...workItems, ...incompleteItems].find(i => i.id === selectedItem);
                    if (!item) return null;
                    
                    // Debug: 檢查項目資料
                    console.log('📝 選中的工作項目:', item);
                    
                    // 取得指派人員名稱
                    const assignee = item.display_name || item.username || 
                      (item.user_id === user.id ? (user.display_name || user.username || '我') : null) ||
                      '未指定';
                    
                    // 取得狀態 - 如果沒有狀態就顯示預設
                    const status = item.progress_status || 'in_progress';
                    
                    // 判斷是否為未完成的過往項目
                    const itemDate = new Date(item.checkin_date).toISOString().split('T')[0];
                    const today = new Date().toISOString().split('T')[0];
                    const isIncompleteItem = itemDate !== today;
                    
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
                          {getPriorityBadge(item.priority)}
                          <div>{getStatusBadge(status)}</div>
                          <span style={{ fontSize: '12px', color: '#999', marginLeft: 'auto' }}>
                            建立於 {formatTime(item.created_at)}
                          </span>
                        </div>

                        {/* 處理人資訊 */}
                        <div style={{ 
                          marginBottom: '15px',
                          padding: '10px',
                          backgroundColor: '#f0f9ff',
                          borderRadius: '6px',
                          border: '1px solid #bfdbfe'
                        }}>
                          <div style={{ marginBottom: '6px', fontSize: '13px' }}>
                            <strong style={{ color: '#0066cc' }}>主要處理人：</strong>
                            {item.handlers?.primary ? (
                              <span style={{ marginLeft: '6px', color: '#333' }}>
                                {item.handlers.primary.display_name || item.handlers.primary.username}
                              </span>
                            ) : (
                              <span style={{ marginLeft: '6px', color: '#999' }}>未指定</span>
                            )}
                          </div>
                          {item.handlers?.co_handlers && item.handlers.co_handlers.length > 0 && (
                            <div style={{ fontSize: '13px', marginBottom: '6px' }}>
                              <strong style={{ color: '#0066cc' }}>共同處理人：</strong>
                              <span style={{ marginLeft: '6px', color: '#333' }}>
                                {item.handlers.co_handlers.map(h => h.display_name || h.username).join(', ')}
                              </span>
                            </div>
                          )}
                          {item.estimated_date && (
                            <div style={{ fontSize: '13px' }}>
                              <strong style={{ color: '#0066cc' }}>預計處理時間：</strong>
                              <span style={{ marginLeft: '6px', color: '#0891b2', fontWeight: '600' }}>
                                {new Date(item.estimated_date).toLocaleDateString('zh-TW', { 
                                  year: 'numeric',
                                  month: '2-digit', 
                                  day: '2-digit' 
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                          
                        {/* 工作項目內容 */}
                        {item.ai_summary ? (
                          <div style={{ 
                            padding: '14px',
                            backgroundColor: '#f8f5ff',
                            borderRadius: '6px',
                            borderLeft: '3px solid #7c3aed',
                            overflowX: 'auto'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                              <Sparkles size={14} style={{ color: '#7c3aed', marginRight: '6px' }} />
                              <span style={{ fontSize: '13px', fontWeight: '600', color: '#7c3aed' }}>工作項目內容</span>
                            </div>
                            <div className="prose-sm markdown-content" style={{ 
                              fontSize: '14px', 
                              lineHeight: '1.7', 
                              color: '#555',
                              wordWrap: 'break-word',
                              wordBreak: 'break-word'
                            }}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.ai_summary}</ReactMarkdown>
                            </div>
                          </div>
                        ) : (
                          <div style={{ 
                            padding: '14px',
                            backgroundColor: '#fafafa',
                            borderRadius: '6px',
                            border: '1px solid #f0f0f0',
                            overflowX: 'auto'
                          }}>
                            <div className="prose-sm markdown-content" style={{ 
                              fontSize: '14px', 
                              lineHeight: '1.7',
                              wordWrap: 'break-word',
                              wordBreak: 'break-word'
                            }}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
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
                <form 
                  onSubmit={(e) => {
                    console.log('📝 表單 onSubmit 事件觸發');
                    handleSubmitUpdate(e);
                  }} 
                  style={{ marginTop: '15px' }}
                >
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
                      {/* 只有主要處理人可以選擇完成或取消 */}
                      {(() => {
                        const item = [...workItems, ...incompleteItems].find(i => i.id === selectedItem);
                        const isPrimary = item?.handlers?.primary?.user_id === user.id;
                        return (
                          <>
                            <option value="completed" disabled={!isPrimary}>
                              已完成{!isPrimary ? ' (僅主要處理人)' : ''}
                            </option>
                            <option value="blocked">受阻</option>
                            <option value="cancelled" disabled={!isPrimary}>
                              已取消{!isPrimary ? ' (僅主要處理人)' : ''}
                            </option>
                          </>
                        );
                      })()}
                    </select>
                    {(() => {
                      const item = [...workItems, ...incompleteItems].find(i => i.id === selectedItem);
                      const isPrimary = item?.handlers?.primary?.user_id === user.id;
                      if (!isPrimary) {
                        return (
                          <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>
                            提示：共同處理人只能更新進度，不能標記為完成或取消
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  <div className="form-group">
                    <label htmlFor="update-content">更新內容</label>
                    <textarea
                      id="update-content"
                      className="form-control"
                      rows={6}
                      placeholder="描述您的工作進展、遇到的問題、下一步計劃等...（Enter 換行，點擊送出按鈕提交）"
                      value={updateContent}
                      onChange={(e) => setUpdateContent(e.target.value)}
                      required
                      style={{ resize: 'vertical', minHeight: '120px' }}
                    />
                    <div className="form-hint">
                      提示：詳細描述您的進展，包括完成了什麼、遇到什麼問題、需要什麼協助。按 Enter 可換行。
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
                            <span style={{ fontSize: '12px', color: '#92400e', marginLeft: '8px' }}>
                              {update.display_name || update.username}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#666' }}>
                            狀態: {getStatusBadge(update.progress_status)}
                          </div>
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
