import { useState, useEffect, useCallback, useMemo } from 'react';
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
  team_id?: number | null;
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
  const [unassignedItems, setUnassignedItems] = useState<BacklogItem[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [assigningItemId, setAssigningItemId] = useState<number | null>(null);
  const [unassignedTargets, setUnassignedTargets] = useState<Record<number, number | ''>>({});
  const currentUserId = user?.id as number | undefined;
  const [selectedCreator, setSelectedCreator] = useState<'all' | number>('all');

  const isItemOwner = (item: BacklogItem) => typeof currentUserId === 'number' && item.user_id === currentUserId;

  const getOwnerLabel = (item: BacklogItem) => {
    if (isItemOwner(item)) {
      return '你';
    }
    return item.display_name || item.username || `成員 #${item.user_id}`;
  };

  useEffect(() => {
    if (typeof teamId !== 'number') {
      return;
    }
    loadBacklogItems();
  }, [teamId]);

  useEffect(() => {
    setSelectedCreator('all');
  }, [teamId]);

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    loadUnassignedItems();
  }, [teamId]);

  const loadBacklogItems = async () => {
    try {
      setLoading(true);
      const items = teamId
        ? await api.getTeamBacklogItems(teamId)
        : await api.getUserBacklogItems();
      setBacklogItems(items);
    } catch (error) {
      console.error('Failed to load backlog items:', error);
      alert('載入 Backlog 項目失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const loadTeams = async () => {
    try {
      const teamList = await api.getTeams();
      setTeams(Array.isArray(teamList) ? teamList : []);
    } catch (error) {
      console.error('Failed to load teams for backlog assignment:', error);
    }
  };

  const loadUnassignedItems = async () => {
    try {
      const allItems = await api.getUserBacklogItems();
      const legacyItems = allItems.filter((item: BacklogItem) => !item.team_id);
      setUnassignedItems(legacyItems);
      setUnassignedTargets(prev => {
        const next: Record<number, number | ''> = {};
        legacyItems.forEach((item: BacklogItem) => {
          const existing = prev[item.id];
          const fallback = typeof teamId === 'number' ? teamId : '';
          next[item.id] = typeof existing === 'number' ? existing : fallback;
        });
        return next;
      });
    } catch (error) {
      console.error('Failed to load unassigned backlog items:', error);
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

  const normalizeEstimatedDate = (value?: string | null) => {
    if (!value) return null;
    return value.includes('T') ? value.split('T')[0] : value;
  };

  const creatorOptions = useMemo(() => {
    const optionsMap = new Map<number, string>();
    backlogItems.forEach((item) => {
      if (typeof item.user_id !== 'number') {
        return;
      }
      const label =
        typeof currentUserId === 'number' && item.user_id === currentUserId
          ? '你'
          : item.display_name || item.username || `成員 #${item.user_id}`;
      optionsMap.set(item.user_id, label);
    });
    return Array.from(optionsMap.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-TW'));
  }, [backlogItems, currentUserId]);

  // Filter function for search
  const filterItems = (items: BacklogItem[]): BacklogItem[] => {
    let filtered = items;
    if (selectedCreator !== 'all') {
      filtered = filtered.filter((item) => item.user_id === selectedCreator);
    }

    if (!searchQuery.trim()) return filtered;
    
    const query = searchQuery.toLowerCase();
    return filtered.filter(item => {
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
        const dateA = normalizeEstimatedDate(a.estimated_date || null);
        const dateB = normalizeEstimatedDate(b.estimated_date || null);

        if (!dateA && !dateB) return a.priority - b.priority;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      });
    }
    
    return sorted;
  };

  const handleCreatorFilterChange = (value: string) => {
    if (value === 'all') {
      setSelectedCreator('all');
      return;
    }
    const parsed = Number(value);
    setSelectedCreator(Number.isNaN(parsed) ? 'all' : parsed);
  };

  const handleSaveItem = async () => {
    if (!title.trim() || !content.trim()) {
      alert('請輸入標題與內容');
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
          teamId,
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
      alert(error.response?.data?.error || '儲存 Backlog 項目失敗');
    } finally {
      setLoading(false);
    }
  };


  const handleDeleteItem = async (item: BacklogItem) => {
    if (!confirm('確定要刪除這個 Backlog 項目嗎？')) return;

    try {
      setLoading(true);
      await api.deleteBacklogItem(item.id);
      await loadBacklogItems();
      alert('Backlog 項目已刪除');
    } catch (error: any) {
      console.error('Delete backlog item error:', error);
      alert(error.response?.data?.error || '刪除 Backlog 項目失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToToday = async (item: BacklogItem) => {
    if (!confirm('確定要將這個 Backlog 項目移到今日工作嗎？\n\nAI 會協助重新整理內容，此操作無法復原。')) return;

    try {
      setLoading(true);
      await api.moveBacklogToWorkItem(item.id, teamId);
      await loadBacklogItems();
      alert('已將 Backlog 項目加入今日工作');

      if (confirm('需要立即前往「今日工作」頁面嗎？')) {
        navigate('/workitems');
      }
    } catch (error: any) {
      console.error('Move to today error:', error);
      alert(error.response?.data?.error || '移動到今日工作失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleEditItem = (item: BacklogItem) => {
    setShowBulkImport(false);
    setShowAddForm(true);
    setEditingItem(item);
    setTitle(item.ai_title || '');
    setContent(item.content);
    setPriority(item.priority || 3);
    setEstimatedDate(item.estimated_date || '');
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
    setShowAddForm(prev => {
      const newState = !prev;
      if (newState) {
        setTitle('');
        setContent('');
        setPriority(3);
        setEstimatedDate('');
        setEditingItem(null);
        setShowBulkImport(false);
      }
      return newState;
    });
  }, []);

  const handleParseTable = async () => {
    if (!tableText.trim()) {
      alert('請貼上要解析的表格內容');
      return;
    }

    try {
      setLoading(true);
      const result = await api.parseTableToBacklogItems(tableText);
      setParsedItems(result.items);
      setShowParsedPreview(true);
    } catch (error: any) {
      console.error('Parse table error:', error);
      alert(error.response?.data?.error || '解析表格失敗，請確認格式是否正確');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveParsedItems = async () => {
    if (parsedItems.length === 0) {
      alert('沒有可匯入的項目');
      return;
    }

    try {
      setLoading(true);
      const normalizedItems = parsedItems.map(item => ({
        title: item.title,
        content: item.content,
        priority: item.priority || 3,
        estimatedDate: item.estimatedDate
      }));

      await api.createBacklogItemsBatch(teamId, normalizedItems);
      await loadBacklogItems();
      
      // Reset bulk import
      setTableText('');
      setParsedItems([]);
      setShowParsedPreview(false);
      setShowBulkImport(false);
      
      alert(`已匯入 ${parsedItems.length} 筆 Backlog 項目`);
    } catch (error: any) {
      console.error('Save parsed items error:', error);
      alert(error.response?.data?.error || '匯入 Backlog 項目失敗');
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

  const handleChangeUnassignedTarget = (itemId: number, value: string) => {
    setUnassignedTargets(prev => ({
      ...prev,
      [itemId]: value ? Number(value) : ''
    }));
  };

  const handleAssignUnassignedItem = async (itemId: number) => {
    const targetTeam = unassignedTargets[itemId];
    if (typeof targetTeam !== 'number') {
      alert('請先選擇要指派的團隊');
      return;
    }

    try {
      setAssigningItemId(itemId);
      await api.updateBacklogItem(itemId, { teamId: targetTeam });
      await Promise.all([loadBacklogItems(), loadUnassignedItems()]);
      alert('已指派團隊，此項目會顯示在對應團隊的 Backlog。');
    } catch (error: any) {
      console.error('Assign backlog team error:', error);
      alert(error.response?.data?.error || '指派團隊失敗，請稍後再試');
    } finally {
      setAssigningItemId(null);
    }
  };

  return (
    <div className="app-container">
      <div className="main-content">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={18} />
              返回儀表板
            </button>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={28} />
              Backlog 工作規劃
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
              {showAddForm ? '關閉表單' : '新增項目'}
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
              {showBulkImport ? '關閉批次匯入' : 'AI 批次匯入'}
            </button>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {user.display_name || user.username}
            </div>
          </div>
        </div>

        {unassignedItems.length > 0 && (
          <div className="card" style={{ marginBottom: '20px', border: '1px solid #fcd34d', background: '#fffbeb' }}>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                <AlertCircle size={20} style={{ color: '#d97706' }} />
                <div style={{ fontSize: '14px', color: '#92400e' }}>
                  偵測到 <strong>{unassignedItems.length}</strong> 筆 Backlog 項目尚未指定團隊，請指派至正確團隊後即可在該團隊中看到。
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {unassignedItems.map(item => {
                  const selectedValue = unassignedTargets[item.id];
                  const isAssigning = assigningItemId === item.id;
                  const canAssign = typeof selectedValue === 'number';
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #fde68a',
                        background: '#fff7ed',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#92400e' }}>
                        {item.ai_title || item.content.substring(0, 50)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#b45309' }}>
                        建立於 {new Date(item.created_at).toLocaleDateString('zh-TW')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <select
                          value={selectedValue === '' ? '' : String(selectedValue)}
                          onChange={(e) => handleChangeUnassignedTarget(item.id, e.target.value)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #fbbf24',
                            fontSize: '13px',
                            minWidth: '180px'
                          }}
                        >
                          <option value="">
                            {teams.length > 0 ? '選擇要指派的團隊' : '尚未載入團隊'}
                          </option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                              {team.id === teamId ? '（目前團隊）' : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn btn-primary"
                          style={{
                            backgroundColor: '#f59e0b',
                            borderColor: '#d97706'
                          }}
                          onClick={() => handleAssignUnassignedItem(item.id)}
                          disabled={!canAssign || isAssigning}
                        >
                          {isAssigning ? '指派中...' : '指派團隊'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={{ marginBottom: '15px' }}>
                {editingItem ? '編輯 Backlog 項目' : '新增 Backlog 項目'}
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
                    placeholder="輸入清楚的標題，方便團隊理解"
                    maxLength={500}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    說明內容 *
                  </label>
                  <textarea
                    className="input"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="補充背景、工作重點、完成定義等資訊"
                    rows={5}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                      優先順序
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(parseInt(e.target.value))}
                      className="form-control"
                    >
                      <option value={1}>🔴 最高 (1)</option>
                      <option value={2}>🟠 高 (2)</option>
                      <option value={3}>🟡 中 (3)</option>
                      <option value={4}>🟢 低 (4)</option>
                      <option value={5}>🔵 最低 (5)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                      預計時間（選填）
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
                    {editingItem ? '儲存變更' : '新增項目'}
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
                AI 批次匯入
              </h3>

              {!showParsedPreview ? (
                <>
                  <div style={{ marginBottom: '15px', padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
                      <AlertCircle size={18} style={{ color: '#3b82f6', marginTop: '2px', flexShrink: 0 }} />
                      <div style={{ fontSize: '13px', color: '#1e40af' }}>
                        <strong>使用說明</strong>
                        <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
                          <li>從 Excel / Google Sheet 複製表格，欄位至少包含「標題、內容、優先、預計日期」。</li>
                          <li>AI 會自動解析表格並建立 Backlog 草稿，可在匯入前進一步調整內容。</li>
                          <li>優先順序請填 1-5，預計日期建議使用 YYYY-MM-DD 格式。</li>
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
                      placeholder={`標題 | 內容 | 優先 | 預計日期\\n調整報表流程 | 將新版報表節點整合進儀表板 | 2 | 2025-11-20\\n改善客服腳本 | 產出 3 個常見 QA 範本 | 3 | 2025-11-25`}
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
                      {loading ? '解析中...' : 'AI 解析表格'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '15px' }}>
                    <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                      AI 已解析 <strong style={{ color: '#667eea' }}>{parsedItems.length}</strong> 筆 Backlog 草稿，請確認後再匯入。
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
                            title="移除這筆資料"
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
                                優先順序
                              </label>
                              <select
                                value={item.priority}
                                onChange={(e) => handleEditParsedItem(index, 'priority', parseInt(e.target.value))}
                                className="form-control"
                                style={{ fontSize: '13px' }}
                              >
                                <option value={1}>🔴 最高</option>
                                <option value={2}>🟠 高</option>
                                <option value={3}>🟡 中</option>
                                <option value={4}>🟢 低</option>
                                <option value={5}>🔵 最低</option>
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
                      回到貼上內容
                    </button>
                    <button
                      className="btn btn-success"
                      onClick={handleSaveParsedItems}
                      disabled={loading || parsedItems.length === 0}
                    >
                      {loading ? '匯入中...' : `匯入 ${parsedItems.length} 筆`}
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
                Backlog 項目（{filterItems(backlogItems).length}{searchQuery && ` / ${backlogItems.length}`}）
              </h3>
              {backlogItems.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {typeof teamId === 'number' && (
                    <select
                      value={selectedCreator === 'all' ? 'all' : String(selectedCreator)}
                      onChange={(e) => handleCreatorFilterChange(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#fff',
                        minWidth: '160px'
                      }}
                    >
                      <option value="all">全部建立者</option>
                      {creatorOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                    <input
                      type="text"
                      placeholder="搜尋 Backlog 項目..."
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
                    title="切換排序方式"
                  >
                    {sortBy === 'priority' ? '按優先順序' : '按預計日期'}
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
                目前沒有 Backlog 項目，點擊「新增項目」開始規劃！
              </p>
            ) : filterItems(backlogItems).length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666', padding: '30px 0' }}>
                找不到符合目前篩選條件的項目
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sortItems(filterItems(backlogItems)).map((item) => {
                  const ownerLabel = getOwnerLabel(item);
                  const normalizedEstimate = normalizeEstimatedDate(item.estimated_date || null);
                  const estimatedText = normalizedEstimate
                    ? (() => {
                        const [year, month, day] = normalizedEstimate.split('-');
                        return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
                      })()
                    : '未設定';
                  return (
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
                          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                            建立者：{ownerLabel}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#666' }}>
                            {getPriorityBadge(item.priority)}
                            <span style={{ fontSize: '11px', color: item.estimated_date ? '#0891b2' : '#999' }}>
                              預計：{estimatedText}
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
                            title="加入今日工作"
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
                            title="編輯這筆 Backlog"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#dc2626',
                              cursor: 'pointer',
                              padding: '4px'
                            }}
                            title="刪除這筆 Backlog"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="markdown-content" style={{ fontSize: '13px', color: '#666', marginTop: '10px' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Backlog;




