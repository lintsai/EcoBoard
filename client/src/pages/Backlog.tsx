import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Trash2, Send, Sparkles, Calendar, AlertCircle, Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';

interface BacklogProps {
  user: any;
  teamId: number;
  onLogout: () => void;
}

interface BacklogItem {
  id: number;
  user_id: number;
  content: string;
  item_type: string;
  ai_title?: string;
  ai_summary?: string;
  priority: number;
  estimated_date?: string;
  is_backlog: boolean;
  progress_status?: string;
  created_at: string;
  updated_at: string;
  username?: string;
  display_name?: string;
}

function Backlog({ user, teamId }: BacklogProps) {
  const navigate = useNavigate();
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  
  // Form states
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState(3);
  const [estimatedDate, setEstimatedDate] = useState('');
  
  // Bulk import state
  const [tableText, setTableText] = useState('');
  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const [showParsedPreview, setShowParsedPreview] = useState(false);
  const [sortBy, setSortBy] = useState<'priority' | 'estimated_date'>('priority');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadBacklogItems();
  }, []);

  const loadBacklogItems = async () => {
    try {
      setLoading(true);
      const items = await api.getUserBacklogItems(teamId);
      setBacklogItems(items);
    } catch (error) {
      console.error('Failed to load backlog items:', error);
      alert('載入 Backlog 項目失敗');
    } finally {
      setLoading(false);
    }
  };

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

  // Filter function for search
  const filterItems = (items: BacklogItem[]): BacklogItem[] => {
    if (!searchQuery.trim()) return items;
    
    const query = searchQuery.toLowerCase();
    return items.filter(item => {
      const title = (item.ai_title || '').toLowerCase();
      const content = item.content.toLowerCase();
      return title.includes(query) || content.includes(query);
    });
  };

  // Sorting function
  const sortItems = (items: BacklogItem[]): BacklogItem[] => {
    const sorted = [...items];
    
    if (sortBy === 'priority') {
      sorted.sort((a, b) => a.priority - b.priority);
    } else {
      // Sort by estimated_date: items without date go to bottom
      sorted.sort((a, b) => {
        if (!a.estimated_date && !b.estimated_date) return a.priority - b.priority;
        if (!a.estimated_date) return 1;
        if (!b.estimated_date) return -1;
        return new Date(a.estimated_date).getTime() - new Date(b.estimated_date).getTime();
      });
    }
    
    return sorted;
  };

  const handleSaveItem = async () => {
    if (!title.trim() || !content.trim()) {
      alert('請填寫標題和內容');
      return;
    }

    try {
      setLoading(true);
      
      if (editingItem) {
        await api.updateBacklogItem(editingItem.id, {
          title,
          content,
          priority,
          estimatedDate: estimatedDate || undefined
        });
      } else {
        await api.createBacklogItem(
          title,
          content,
          priority,
          estimatedDate || undefined
        );
      }

      await loadBacklogItems();
      resetForm();
      alert(editingItem ? '更新成功！' : '新增成功！');
    } catch (error: any) {
      console.error('Save backlog item error:', error);
      alert(error.response?.data?.error || '儲存失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm('確定要刪除此項目嗎？')) return;

    try {
      setLoading(true);
      await api.deleteBacklogItem(itemId);
      await loadBacklogItems();
      alert('刪除成功！');
    } catch (error: any) {
      console.error('Delete backlog item error:', error);
      alert(error.response?.data?.error || '刪除失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToToday = async (item: BacklogItem) => {
    if (!confirm(`確定要將「${item.ai_title || item.content.substring(0, 30)}」加入今日工作項目嗎？\n\n此項目將會以標題進行第一次 AI 對談。`)) return;

    try {
      setLoading(true);
      await api.moveBacklogToWorkItem(item.id, teamId);
      await loadBacklogItems();
      alert('已加入今日工作項目！');
      
      // 可選：自動跳轉到工作項目頁面
      if (confirm('是否前往工作項目頁面查看？')) {
        navigate('/workitems');
      }
    } catch (error: any) {
      console.error('Move to today error:', error);
      alert(error.response?.data?.error || '移動失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item: BacklogItem) => {
    setEditingItem(item);
    setTitle(item.ai_title || '');
    setContent(item.content);
    setPriority(item.priority);
    // 轉換日期格式為 YYYY-MM-DD
    setEstimatedDate(item.estimated_date ? item.estimated_date.split('T')[0] : '');
    setShowAddForm(true);
    setShowBulkImport(false);
    // 滾動到表單區域
    setTimeout(() => {
      const formElement = document.querySelector('.card');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    setShowBulkImport(false);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setPriority(3);
    setEstimatedDate('');
    setEditingItem(null);
    setShowAddForm(false);
  };

  const handleToggleAddForm = useCallback(() => {
    console.log('手動新增按鈕被點擊', { currentShowAddForm: showAddForm, loading });
    setShowAddForm(prev => {
      console.log('切換狀態:', prev, '->', !prev);
      const newState = !prev;
      if (newState) {
        // 開啟表單，清空並關閉批次匯入
        setTitle('');
        setContent('');
        setPriority(3);
        setEstimatedDate('');
        setEditingItem(null);
        setShowBulkImport(false);
      }
      return newState;
    });
  }, [showAddForm, loading]);

  const handleParseTable = async () => {
    if (!tableText.trim()) {
      alert('請貼上表格內容');
      return;
    }

    try {
      setLoading(true);
      const result = await api.parseTableToBacklogItems(tableText);
      setParsedItems(result.items);
      setShowParsedPreview(true);
    } catch (error: any) {
      console.error('Parse table error:', error);
      alert(error.response?.data?.error || '解析表格失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveParsedItems = async () => {
    if (parsedItems.length === 0) {
      alert('沒有可儲存的項目');
      return;
    }

    try {
      setLoading(true);
      const itemsWithTeamId = parsedItems.map(item => ({
        ...item,
        teamId
      }));
      
      await api.createBacklogItemsBatch(parsedItems);
      await loadBacklogItems();
      
      // Reset bulk import
      setTableText('');
      setParsedItems([]);
      setShowParsedPreview(false);
      setShowBulkImport(false);
      
      alert(`成功新增 ${parsedItems.length} 個項目！`);
    } catch (error: any) {
      console.error('Save parsed items error:', error);
      alert(error.response?.data?.error || '批量新增失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleEditParsedItem = (index: number, field: string, value: any) => {
    const updated = [...parsedItems];
    updated[index] = { ...updated[index], [field]: value };
    setParsedItems(updated);
  };

  const handleRemoveParsedItem = (index: number) => {
    setParsedItems(parsedItems.filter((_, i) => i !== index));
  };

  return (
    <div className="app-container">
      <div className="main-content">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={18} />
              返回
            </button>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={28} />
              工作項目規劃（Backlog）
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleToggleAddForm}
              disabled={loading}
            >
              <Plus size={18} />
              {showAddForm ? '取消新增' : '手動新增'}
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => {
                setShowBulkImport(!showBulkImport);
                setShowAddForm(false);
                resetForm();
              }}
              disabled={loading}
            >
              <Sparkles size={18} />
              {showBulkImport ? '取消匯入' : 'AI 批量匯入'}
            </button>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {user.display_name || user.username}
            </div>
          </div>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={{ marginBottom: '15px' }}>
                {editingItem ? '編輯項目' : '新增項目'}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    標題 *
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="簡短描述工作項目..."
                    maxLength={500}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    詳細內容 *
                  </label>
                  <textarea
                    className="input"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="詳細描述工作內容、目標、需求等..."
                    rows={5}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                      優先級
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(parseInt(e.target.value))}
                      className="form-control"
                    >
                      <option value={1}>🔴 最高優先級 (1)</option>
                      <option value={2}>🟠 高優先級 (2)</option>
                      <option value={3}>🟡 中優先級 (3)</option>
                      <option value={4}>🟢 低優先級 (4)</option>
                      <option value={5}>🔵 最低優先級 (5)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                      預計處理時間：
                    </label>
                    <input
                      type="date"
                      className="input"
                      value={estimatedDate ? (() => {
                        const dateStr = typeof estimatedDate === 'string' && estimatedDate.includes('T') ? estimatedDate.split('T')[0] : estimatedDate;
                        return dateStr;
                      })() : ''}
                      onChange={(e) => setEstimatedDate(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={resetForm}
                    disabled={loading}
                  >
                    取消
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveItem}
                    disabled={loading}
                  >
                    {editingItem ? '更新' : '新增'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Import */}
        {showBulkImport && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} style={{ color: '#667eea' }} />
                AI 批量匯入
              </h3>

              {!showParsedPreview ? (
                <>
                  <div style={{ marginBottom: '15px', padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
                      <AlertCircle size={18} style={{ color: '#3b82f6', marginTop: '2px', flexShrink: 0 }} />
                      <div style={{ fontSize: '13px', color: '#1e40af' }}>
                        <strong>使用說明：</strong>
                        <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
                          <li>可直接貼上 Excel、Word 表格或純文字格式</li>
                          <li>AI 會自動識別標題、內容、優先級、預計時間等欄位</li>
                          <li>解析後可以手動修改每個項目再儲存</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                      貼上表格內容
                    </label>
                    <textarea
                      className="input"
                      value={tableText}
                      onChange={(e) => setTableText(e.target.value)}
                      placeholder="貼上包含工作項目的表格...&#10;&#10;範例：&#10;標題           | 內容                     | 優先級 | 預計時間&#10;修復登入問題    | 用戶無法登入系統          | 高     | 2025-11-20&#10;優化查詢效能    | 資料庫查詢太慢            | 中     | 2025-11-25"
                      rows={10}
                      style={{ resize: 'vertical', fontFamily: 'monospace' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowBulkImport(false);
                        setTableText('');
                      }}
                      disabled={loading}
                    >
                      取消
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={handleParseTable}
                      disabled={loading || !tableText.trim()}
                    >
                      <Sparkles size={18} />
                      {loading ? '解析中...' : 'AI 解析'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '15px' }}>
                    <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                      AI 已解析出 <strong style={{ color: '#667eea' }}>{parsedItems.length}</strong> 個工作項目，請確認或修改後儲存：
                    </p>
                  </div>

                  <div style={{ maxHeight: '500px', overflowY: 'auto', marginBottom: '15px' }}>
                    {parsedItems.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          marginBottom: '15px',
                          padding: '15px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          backgroundColor: '#fff'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
                            項目 #{index + 1}
                          </h4>
                          <button
                            onClick={() => handleRemoveParsedItem(index)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#dc2626',
                              cursor: 'pointer',
                              padding: '4px'
                            }}
                            title="移除此項目"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px', fontWeight: '500' }}>
                              標題
                            </label>
                            <input
                              type="text"
                              className="input"
                              value={item.title}
                              onChange={(e) => handleEditParsedItem(index, 'title', e.target.value)}
                              style={{ fontSize: '13px' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px', fontWeight: '500' }}>
                              內容
                            </label>
                            <textarea
                              className="input"
                              value={item.content}
                              onChange={(e) => handleEditParsedItem(index, 'content', e.target.value)}
                              rows={3}
                              style={{ fontSize: '13px', resize: 'vertical' }}
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px', fontWeight: '500' }}>
                                優先級
                              </label>
                              <select
                                value={item.priority}
                                onChange={(e) => handleEditParsedItem(index, 'priority', parseInt(e.target.value))}
                                className="form-control"
                                style={{ fontSize: '13px' }}
                              >
                                <option value={1}>🔴 最高 (1)</option>
                                <option value={2}>🟠 高 (2)</option>
                                <option value={3}>🟡 中 (3)</option>
                                <option value={4}>🟢 低 (4)</option>
                                <option value={5}>🔵 最低 (5)</option>
                              </select>
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '12px', marginBottom: '3px', fontWeight: '500' }}>
                                預計時間
                              </label>
                              <input
                                type="date"
                                className="input"
                                value={item.estimatedDate ? (() => {
                                  const dateStr = typeof item.estimatedDate === 'string' && item.estimatedDate.includes('T') ? item.estimatedDate.split('T')[0] : item.estimatedDate;
                                  return dateStr;
                                })() : ''}
                                onChange={(e) => handleEditParsedItem(index, 'estimatedDate', e.target.value || null)}
                                style={{ fontSize: '13px' }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setParsedItems([]);
                        setShowParsedPreview(false);
                      }}
                      disabled={loading}
                    >
                      重新解析
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={handleSaveParsedItems}
                      disabled={loading || parsedItems.length === 0}
                    >
                      {loading ? '儲存中...' : `儲存全部 (${parsedItems.length})`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Backlog Items List */}
        <div className="card">
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>
                待規劃項目 ({filterItems(backlogItems).length}{searchQuery && ` / ${backlogItems.length}`})
              </h3>
              {backlogItems.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                    <input
                      type="text"
                      placeholder="搜尋標題或內容..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        padding: '6px 12px 6px 32px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        width: '200px'
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: '#999',
                          cursor: 'pointer',
                          fontSize: '18px',
                          padding: '0 4px'
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setSortBy(sortBy === 'priority' ? 'estimated_date' : 'priority')}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      borderRadius: '4px',
                      border: '1px solid #667eea',
                      backgroundColor: '#667eea',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                    title="點擊切換排序方式"
                  >
                    {sortBy === 'priority' ? '🔢 優先級' : '📅 預計時間'}
                  </button>
                </div>
              )}
            </div>

            {loading && backlogItems.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666', padding: '30px 0' }}>
                載入中...
              </p>
            ) : backlogItems.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666', padding: '30px 0' }}>
                還沒有規劃項目，點擊上方按鈕開始新增吧！
              </p>
            ) : filterItems(backlogItems).length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666', padding: '30px 0' }}>
                找不到符合「{searchQuery}」的項目
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sortItems(filterItems(backlogItems)).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '15px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      backgroundColor: '#fff',
                      transition: 'box-shadow 0.2s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, marginBottom: '5px', fontSize: '15px', fontWeight: '600' }}>
                          {item.ai_title || item.content.substring(0, 50)}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#666' }}>
                          {getPriorityBadge(item.priority)}
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
                          <span>
                            建立於 {new Date(item.created_at).toLocaleDateString('zh-TW')}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => handleMoveToToday(item)}
                          className="btn btn-success"
                          style={{ padding: '6px 12px', fontSize: '13px' }}
                          disabled={loading}
                          title="加入今日工作項目"
                        >
                          <Send size={14} />
                          加入今日
                        </button>
                        <button
                          onClick={() => handleEditItem(item)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#667eea',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="編輯"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="markdown-content" style={{ fontSize: '13px', color: '#666', marginTop: '10px' }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Backlog;
