import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Clock, CheckCircle, AlertCircle, Loader2, Sparkles, TrendingUp, ChevronDown, ChevronUp, UserPlus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';

interface TeamMember {
  user_id: number;
  username: string;
  display_name: string;
  role: string;
}

interface CheckinRecord {
  id: number;
  user_id: number;
  username: string;
  display_name: string;
  checkin_time: string;
  status: string;
}

interface WorkItem {
  id: number;
  user_id: number;
  username: string;
  display_name: string;
  content: string;
  item_type: string;
  created_at: string;
  priority?: number;
  session_id?: string;
  ai_summary?: string;
  ai_title?: string;
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

function StandupReview({ user, teamId }: any) {
  const navigate = useNavigate();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [incompleteItems, setIncompleteItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [error, setError] = useState('');
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set());
  const [showAllWorkItems, setShowAllWorkItems] = useState(true);
  const [showIncompleteItems, setShowIncompleteItems] = useState(true);
  const [assigningItem, setAssigningItem] = useState<number | null>(null);
  const [enlargedTable, setEnlargedTable] = useState<string | null>(null);
  const [expandedWorkItems, setExpandedWorkItems] = useState<Set<number | string>>(new Set());
  const [showHandlerModal, setShowHandlerModal] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItem | null>(null);
  const [selectedPrimaryHandler, setSelectedPrimaryHandler] = useState<number | null>(null);
  const [selectedCoHandlers, setSelectedCoHandlers] = useState<number[]>([]);
  const [selectedPriority, setSelectedPriority] = useState<number>(3);

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

  useEffect(() => {
    if (teamId) {
      loadStandupData();
    }
  }, [teamId]);

  useEffect(() => {
    // Add table click handler
    const handleTableClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      const table = target.closest('.markdown-content table');
      if (table && !target.closest('.table-modal-content')) {
        const tableHTML = (table as HTMLElement).outerHTML;
        setEnlargedTable(tableHTML);
      }
    };

    // Add ESC key handler
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnlargedTable(null);
        setShowHandlerModal(false);
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
    // 默認展開所有成員
    if (teamMembers.length > 0) {
      setExpandedMembers(new Set(teamMembers.map(m => m.user_id)));
    }
  }, [teamMembers]);

  const loadStandupData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [membersData, checkinsData, workItemsData, incompleteItemsData] = await Promise.all([
        api.getTeamMembers(teamId),
        api.getTodayTeamCheckins(teamId),
        api.getTodayTeamWorkItems(teamId),
        api.getIncompleteTeamWorkItems(teamId)
      ]);

      console.log('=== Standup Review Debug ===');
      console.log('Team members:', membersData);
      console.log('Today checkins:', checkinsData);
      console.log('Today work items:', workItemsData);
      console.log('Incomplete items:', incompleteItemsData);
      console.log('Today date (client):', new Date().toISOString().split('T')[0]);
      
      // 檢查數據匹配
      membersData.forEach((member: any) => {
        const hasCheckin = checkinsData.find((c: any) => c.user_id === member.user_id);
        const todayWorkItemCount = workItemsData.filter((item: any) => item.user_id === member.user_id).length;
        const incompleteCount = incompleteItemsData.filter((item: any) => item.user_id === member.user_id).length;
        console.log(`${member.display_name || member.username} (ID: ${member.user_id}):`, {
          hasCheckin: !!hasCheckin,
          checkinTime: hasCheckin?.checkin_time,
          todayWorkItems: todayWorkItemCount,
          incompleteItems: incompleteCount
        });
      });
      console.log('===========================');

      setTeamMembers(membersData);
      setCheckins(checkinsData);
      setWorkItems(workItemsData);
      setIncompleteItems(incompleteItemsData);
    } catch (err: any) {
      setError(err.message || '載入站立會議資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeWorkItems = async () => {
    // 合併今日項目和未完成項目進行分析
    const allItems = [...workItems, ...incompleteItems];
    
    if (allItems.length === 0) {
      setError('目前沒有工作項目可以分析');
      return;
    }

    setAnalyzing(true);
    setError('');
    
    try {
      const result = await api.analyzeWorkItems(teamId, allItems);
      
      // 確保有分析內容
      if (result.analysis) {
        setAnalysis(result.analysis);
        setAnalysisData(result.data); // 保存結構化數據供後續使用
      } else if (result.summary) {
        // 如果是舊格式，轉換成文本
        let analysisText = `## 📊 團隊工作分配分析\n\n### 總覽\n${result.summary}\n\n`;
        
        if (result.keyTasks && result.keyTasks.length > 0) {
          analysisText += `### 🎯 關鍵任務\n`;
          result.keyTasks.forEach((task: string, index: number) => {
            analysisText += `${index + 1}. ${task}\n`;
          });
        }
        
        setAnalysis(analysisText);
        setAnalysisData(result);
      } else {
        setAnalysis('分析完成，但沒有返回詳細資訊');
        setAnalysisData(null);
      }
    } catch (err: any) {
      console.error('AI analyze error:', err);
      setError(err.response?.data?.error || 'AI 分析失敗');
    } finally {
      setAnalyzing(false);
    }
  };

  const getCheckinStatus = (userId: number) => {
    return checkins.find(c => c.user_id === userId) ? 'checked-in' : 'not-checked';
  };

  const getUserWorkItems = (userId: number) => {
    return workItems
      .filter(item => item.user_id === userId)
      .sort((a, b) => {
        // 優先按照優先級排序（數字越小越前面）
        const aPriority = a.priority ?? 3;
        const bPriority = b.priority ?? 3;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        // 優先級相同時按照創建時間排序（新的在前）
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  };

  const getUserIncompleteItems = (userId: number) => {
    return incompleteItems
      .filter(item => item.user_id === userId)
      .sort((a, b) => {
        // 優先按照優先級排序（數字越小越前面）
        const aPriority = a.priority ?? 3;
        const bPriority = b.priority ?? 3;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        // 優先級相同時按照創建時間排序（新的在前）
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  };

  // 獲取用戶作為共同處理人的工作項目
  const getUserCoHandlerWorkItems = (userId: number) => {
    return workItems
      .filter(item => 
        item.handlers?.co_handlers?.some(h => h.user_id === userId) && 
        item.user_id !== userId
      )
      .sort((a, b) => {
        // 優先按照優先級排序（數字越小越前面）
        const aPriority = a.priority ?? 3;
        const bPriority = b.priority ?? 3;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        // 優先級相同時按照創建時間排序（新的在前）
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  };

  const getUserCoHandlerIncompleteItems = (userId: number) => {
    return incompleteItems
      .filter(item => 
        item.handlers?.co_handlers?.some(h => h.user_id === userId) && 
        item.user_id !== userId
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return {
          text: '已完成',
          icon: <CheckCircle size={12} />,
          color: '#065f46',
          bgColor: '#d1fae5'
        };
      case 'in_progress':
        return {
          text: '進行中',
          icon: <Clock size={12} />,
          color: '#92400e',
          bgColor: '#fef3c7'
        };
      case 'not_started':
        return {
          text: '未開始',
          icon: <Clock size={12} />,
          color: '#374151',
          bgColor: '#f3f4f6'
        };
      case 'cancelled':
        return {
          text: '已取消',
          icon: <AlertCircle size={12} />,
          color: '#1f2937',
          bgColor: '#e5e7eb'
        };
      default:
        return {
          text: '進行中',
          icon: <Clock size={12} />,
          color: '#92400e',
          bgColor: '#fef3c7'
        };
    }
  };

  const toggleMemberExpand = (userId: number) => {
    const newExpanded = new Set(expandedMembers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedMembers(newExpanded);
  };

  const toggleAllWorkItems = () => {
    setShowAllWorkItems(!showAllWorkItems);
  };

  const handleAssignWorkItem = async (itemId: number, newUserId: number) => {
    if (!newUserId) {
      setAssigningItem(null);
      return;
    }

    try {
      setLoading(true);
      await api.reassignWorkItem(itemId, newUserId);
      setAssigningItem(null);
      
      // 重新加載數據
      await loadStandupData();
      
      alert('工作項目已重新分配！');
    } catch (err: any) {
      console.error('Reassign work item error:', err);
      setError(err.response?.data?.error || '重新分配工作項目失敗');
      alert(err.response?.data?.error || '重新分配工作項目失敗');
    } finally {
      setLoading(false);
    }
  };

  const openHandlerModal = (item: WorkItem) => {
    setEditingWorkItem(item);
    setSelectedPrimaryHandler(item.handlers?.primary?.user_id || null);
    setSelectedCoHandlers(item.handlers?.co_handlers?.map(h => h.user_id) || []);
    setShowHandlerModal(true);
  };

  const openPriorityModal = (item: WorkItem) => {
    setEditingWorkItem(item);
    setSelectedPriority(item.priority || 3);
    setShowPriorityModal(true);
  };

  const handleSavePriority = async () => {
    if (!editingWorkItem) {
      return;
    }

    try {
      setLoading(true);
      await api.updateWorkItem(editingWorkItem.id, {
        priority: selectedPriority
      });
      await loadStandupData();
      setShowPriorityModal(false);
      setEditingWorkItem(null);
      alert('優先級已更新！');
    } catch (err: any) {
      console.error('Update priority error:', err);
      alert(err.response?.data?.error || '更新優先級失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHandlers = async () => {
    if (!editingWorkItem || !selectedPrimaryHandler) {
      alert('請選擇主要處理人');
      return;
    }

    try {
      setLoading(true);

      const originalPrimaryId = editingWorkItem.handlers?.primary?.user_id || editingWorkItem.user_id;
      const currentCoHandlerIds = editingWorkItem.handlers?.co_handlers?.map(h => h.user_id) || [];
      
      // 1. 先處理共同處理人的移除（在重新指派之前）
      // 移除不再是共同處理人的用戶（但不包括即將成為新主要處理人的用戶）
      for (const userId of currentCoHandlerIds) {
        if (!selectedCoHandlers.includes(userId) && userId !== selectedPrimaryHandler) {
          await api.removeCoHandler(editingWorkItem.id, userId);
        }
      }

      // 2. 重新指派主要處理人（如果改變了）
      if (selectedPrimaryHandler !== originalPrimaryId) {
        await api.reassignWorkItem(editingWorkItem.id, selectedPrimaryHandler);
      }

      // 3. 添加新的共同處理人
      // 需要排除：原主要處理人（可能還在 handlers 中）、新主要處理人、已經是共同處理人的
      for (const userId of selectedCoHandlers) {
        if (userId !== selectedPrimaryHandler && userId !== originalPrimaryId) {
          if (!currentCoHandlerIds.includes(userId)) {
            try {
              await api.addCoHandler(editingWorkItem.id, userId);
            } catch (err: any) {
              // 如果已經是處理人，忽略錯誤
              console.log('Add co-handler warning:', err.response?.data?.error);
              if (!err.response?.data?.error?.includes('已經是')) {
                throw err;
              }
            }
          }
        }
      }

      // 重新加載數據
      await loadStandupData();
      setShowHandlerModal(false);
      setEditingWorkItem(null);
      alert('處理人設定已更新！');
    } catch (err: any) {
      console.error('Save handlers error:', err);
      alert(err.response?.data?.error || '更新處理人失敗');
    } finally {
      setLoading(false);
    }
  };

  const toggleCoHandler = (userId: number) => {
    if (selectedCoHandlers.includes(userId)) {
      setSelectedCoHandlers(selectedCoHandlers.filter(id => id !== userId));
    } else {
      setSelectedCoHandlers([...selectedCoHandlers, userId]);
    }
  };

  // 跳轉到原始項目（在主要處理人的區域）
  const scrollToOriginalItem = (workItemId: number, primaryUserId: number) => {
    // 先展開該成員的區域
    const newExpanded = new Set(expandedMembers);
    newExpanded.add(primaryUserId);
    setExpandedMembers(newExpanded);
    
    // 展開該工作項目
    const newExpandedItems = new Set(expandedWorkItems);
    newExpandedItems.add(workItemId);
    setExpandedWorkItems(newExpandedItems);
    
    // 展開未完成項目區塊（如果原始項目在未完成項目中）
    setShowIncompleteItems(true);
    
    // 等待 DOM 更新後滾動
    setTimeout(() => {
      const element = document.getElementById(`work-item-${workItemId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 添加高亮效果
        element.style.backgroundColor = '#fef3c7';
        setTimeout(() => {
          element.style.backgroundColor = '';
        }, 2000);
      }
    }, 100);
  };

  const getUnassignedWorkItems = () => {
    const assignedUserIds = new Set(teamMembers.map(m => m.user_id));
    return workItems.filter(item => !assignedUserIds.has(item.user_id));
  };

  const unassignedItems = getUnassignedWorkItems();

  const checkinRate = teamMembers.length > 0
    ? Math.round((checkins.length / teamMembers.length) * 100)
    : 0;

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
            <h1>站立會議 Review</h1>
            <p className="subtitle">查看團隊今日打卡狀況與工作項目，AI 分析並提供建議</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-secondary"
              onClick={loadStandupData}
              disabled={loading}
              title="重新載入數據"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  載入中...
                </>
              ) : (
                '🔄 重新整理'
              )}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAnalyzeWorkItems}
              disabled={analyzing || workItems.length === 0}
            >
              {analyzing ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  分析中...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  AI 分析工作分配
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {/* 統計卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#e3f2fd' }}>
              <Users size={24} style={{ color: '#0066cc' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">團隊人數</div>
              <div className="stat-value">{teamMembers.length}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#e8f5e9' }}>
              <CheckCircle size={24} style={{ color: '#4caf50' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">已打卡</div>
              <div className="stat-value">{checkins.length}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#fff3e0' }}>
              <Clock size={24} style={{ color: '#ff9800' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">打卡率</div>
              <div className="stat-value">{checkinRate}%</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#f3e5f5' }}>
              <TrendingUp size={24} style={{ color: '#9c27b0' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">今日項目</div>
              <div className="stat-value">{workItems.length}</div>
            </div>
          </div>
          
          {incompleteItems.length > 0 && (
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#fff3e0' }}>
                <AlertCircle size={24} style={{ color: '#f59e0b' }} />
              </div>
              <div className="stat-content">
                <div className="stat-label">未完成項目</div>
                <div className="stat-value">{incompleteItems.length}</div>
              </div>
            </div>
          )}
        </div>

        {/* AI 分析結果 */}
        {analysis && (
          <div className="card" style={{ marginBottom: '20px', backgroundColor: '#f0f8ff', borderLeft: '4px solid #0066cc' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
              <Sparkles size={20} style={{ color: '#0066cc' }} />
              AI 分析與建議
            </h3>
            <div className="markdown-content" style={{ fontSize: '14px', lineHeight: '1.8' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
            </div>
            
            {/* 快速執行重新分配建議 */}
            {analysisData?.redistributionSuggestions && analysisData.redistributionSuggestions.length > 0 && (
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #d0e8ff' }}>
                <h4 style={{ fontSize: '15px', marginBottom: '12px', color: '#0066cc' }}>
                  ⚡ 快速執行重新分配
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analysisData.redistributionSuggestions.map((suggestion: any, index: number) => {
                    // 找到對應的工作項目和成員
                    const fromMember = teamMembers.find(m => 
                      (m.display_name || m.username).includes(suggestion.from) || 
                      suggestion.from.includes(m.display_name || m.username)
                    );
                    const toMember = teamMembers.find(m => 
                      (m.display_name || m.username).includes(suggestion.to) || 
                      suggestion.to.includes(m.display_name || m.username)
                    );
                    
                    if (!fromMember || !toMember) return null;
                    
                    // 找到該成員的工作項目（可能需要部分匹配）
                    const workItem = workItems.find(item => 
                      item.user_id === fromMember.user_id && 
                      (item.ai_title?.includes(suggestion.task) || item.content.includes(suggestion.task))
                    );
                    
                    if (!workItem) return null;
                    
                    // 取得優先級資訊
                    const priority = suggestion.priority || workItem.priority || 3;
                    
                    return (
                      <div 
                        key={index}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '12px',
                          backgroundColor: '#fff',
                          borderRadius: '6px',
                          border: '1px solid #d0e8ff'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            {getPriorityBadge(priority)}
                            <span style={{ fontSize: '14px', fontWeight: '500' }}>
                              {suggestion.task}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                            從 <strong>{suggestion.from}</strong> 分配給 <strong>{suggestion.to}</strong>
                          </div>
                          {suggestion.reason && (
                            <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
                              原因：{suggestion.reason}
                            </div>
                          )}
                          {workItem.handlers?.co_handlers && workItem.handlers.co_handlers.length > 0 && (
                            <div style={{ fontSize: '11px', color: '#0066cc', marginTop: '4px' }}>
                              💡 當前有 {workItem.handlers.co_handlers.length} 位共同處理人
                            </div>
                          )}
                        </div>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '13px', padding: '6px 12px' }}
                          onClick={async () => {
                            if (window.confirm(`確定要將「${suggestion.task}」從 ${suggestion.from} 重新分配給 ${suggestion.to} 嗎？`)) {
                              await handleAssignWorkItem(workItem.id, toMember.user_id);
                            }
                          }}
                        >
                          執行分配
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 團隊成員打卡狀況 */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>團隊成員打卡狀況</h3>
            <div style={{ fontSize: '13px', color: '#666' }}>
              已打卡: <strong style={{ color: '#4caf50' }}>{checkins.length}</strong> / 
              未打卡: <strong style={{ color: '#999' }}>{teamMembers.length - checkins.length}</strong>
            </div>
          </div>
          {teamMembers.length === 0 ? (
            <p style={{ color: '#666', marginTop: '15px' }}>團隊暫無成員</p>
          ) : (
            <div style={{ marginTop: '15px' }}>
              {teamMembers.map((member) => {
                const status = getCheckinStatus(member.user_id);
                const checkin = checkins.find(c => c.user_id === member.user_id);
                const memberWorkItems = getUserWorkItems(member.user_id);
                
                // Debug log
                console.log(`Member: ${member.display_name || member.username}`, {
                  user_id: member.user_id,
                  status,
                  checkin,
                  workItemsCount: memberWorkItems.length
                });

                return (
                  <div
                    key={member.user_id}
                    style={{
                      padding: '15px',
                      marginBottom: '15px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      border: '1px solid #e0e0e0'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            backgroundColor: status === 'checked-in' ? '#4caf50' : '#ccc',
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
                          <div style={{ fontWeight: 500, fontSize: '16px' }}>
                            {member.display_name || member.username}
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            @{member.username}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        {status === 'checked-in' ? (
                          <>
                            <span className="badge badge-success">
                              <CheckCircle size={14} />
                              已打卡
                            </span>
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                              {checkin && formatTime(checkin.checkin_time)}
                            </div>
                          </>
                        ) : (
                          <span className="badge badge-secondary">
                            <Clock size={14} />
                            未打卡
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 工作項目區域 - 始終顯示 */}
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e0e0e0' }}>
                      {/* 今日工作項目 */}
                      {memberWorkItems.length > 0 ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              cursor: 'pointer',
                              marginBottom: '8px'
                            }}
                            onClick={() => toggleMemberExpand(member.user_id)}
                          >
                            <div style={{ fontSize: '13px', fontWeight: 500, color: '#666' }}>
                              今日工作項目 ({memberWorkItems.length})
                            </div>
                            {expandedMembers.has(member.user_id) ? (
                              <ChevronUp size={16} style={{ color: '#666' }} />
                            ) : (
                              <ChevronDown size={16} style={{ color: '#666' }} />
                            )}
                          </div>
                          {expandedMembers.has(member.user_id) && (
                          <div style={{ marginTop: '8px' }}>
                            {memberWorkItems.map((item) => {
                              const isItemExpanded = expandedWorkItems.has(item.id);
                              
                              return (
                                <div 
                                  key={item.id}
                                  id={`work-item-${item.id}`}
                                  style={{ 
                                    marginBottom: '8px',
                                    backgroundColor: '#fff',
                                    borderRadius: '6px',
                                    borderLeft: '3px solid #7c3aed',
                                    overflow: 'hidden',
                                    transition: 'background-color 0.3s ease'
                                  }}
                                >
                                  {/* Header - Always Visible */}
                                  <div
                                    style={{
                                      padding: '10px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      cursor: 'pointer',
                                      backgroundColor: isItemExpanded ? '#f8f9fa' : '#fff'
                                    }}
                                    onClick={(e) => {
                                      // Don't toggle if clicking on reassign button area
                                      if ((e.target as HTMLElement).closest('.reassign-area')) {
                                        return;
                                      }
                                      const newExpanded = new Set(expandedWorkItems);
                                      if (isItemExpanded) {
                                        newExpanded.delete(item.id);
                                      } else {
                                        newExpanded.add(item.id);
                                      }
                                      setExpandedWorkItems(newExpanded);
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                      {isItemExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                      <div style={{ fontWeight: '600', fontSize: '14px' }}>
                                        {item.ai_title || item.content}
                                      </div>
                                      {getPriorityBadge(item.priority)}
                                      {(() => {
                                        const statusBadge = getStatusBadge(item.progress_status);
                                        return (
                                          <span
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              padding: '2px 8px',
                                              borderRadius: '12px',
                                              fontSize: '11px',
                                              fontWeight: '500',
                                              color: statusBadge.color,
                                              backgroundColor: statusBadge.bgColor
                                            }}
                                          >
                                            {statusBadge.icon}
                                            {statusBadge.text}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ fontSize: '11px', color: '#999' }}>
                                        {formatTime(item.created_at).split(' ')[1]}
                                      </div>
                                      <div className="reassign-area" style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                          className="btn btn-secondary"
                                          style={{ fontSize: '11px', padding: '4px 8px' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openPriorityModal(item);
                                          }}
                                          title="設定優先級"
                                        >
                                          🎯
                                        </button>
                                        <button
                                          className="btn btn-secondary"
                                          style={{ fontSize: '11px', padding: '4px 8px' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openHandlerModal(item);
                                          }}
                                          title="設定處理人"
                                        >
                                          <UserPlus size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Expanded Content */}
                                  {isItemExpanded && (
                                    <div style={{ padding: '0 10px 10px 10px', borderTop: '1px solid #e5e7eb' }}>
                                      {/* 處理人信息 */}
                                      <div style={{ marginTop: '8px', marginBottom: '8px', fontSize: '13px' }}>
                                        <div style={{ marginBottom: '4px' }}>
                                          <strong style={{ color: '#667eea' }}>主要處理人：</strong>
                                          {item.handlers?.primary ? (
                                            <span style={{ marginLeft: '4px' }}>
                                              {item.handlers.primary.display_name || item.handlers.primary.username}
                                            </span>
                                          ) : (
                                            <span style={{ marginLeft: '4px', color: '#999' }}>未指定</span>
                                          )}
                                        </div>
                                        {item.handlers?.co_handlers && item.handlers.co_handlers.length > 0 && (
                                          <div>
                                            <strong style={{ color: '#667eea' }}>共同處理人：</strong>
                                            <span style={{ marginLeft: '4px' }}>
                                              {item.handlers.co_handlers.map(h => h.display_name || h.username).join(', ')}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {item.ai_summary && (
                                        <div style={{
                                          padding: '8px',
                                          backgroundColor: '#f8f9fa',
                                          borderRadius: '4px',
                                          marginTop: '8px'
                                        }}>
                                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                            <Sparkles size={12} style={{ color: '#7c3aed', marginRight: '4px' }} />
                                            <span style={{ fontSize: '11px', fontWeight: '600', color: '#7c3aed' }}>AI 摘要</span>
                                          </div>
                                          <div className="markdown-content" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.ai_summary}</ReactMarkdown>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#999', padding: '10px 0' }}>
                          尚未分配今日工作項目
                        </div>
                      )}
                      
                      {/* 未完成項目區塊 - 獨立顯示，不受今日工作項目影響 */}
                      {(() => {
                        const memberIncompleteItems = getUserIncompleteItems(member.user_id);
                        if (memberIncompleteItems.length === 0) return null;
                        
                        return (
                          <>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer',
                                marginTop: '12px',
                                marginBottom: '8px',
                                padding: '8px',
                                backgroundColor: '#fffbeb',
                                borderRadius: '4px'
                              }}
                              onClick={() => setShowIncompleteItems(!showIncompleteItems)}
                            >
                                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#92400e' }}>
                                    ⚠️ 未完成項目 ({memberIncompleteItems.length})
                                  </div>
                                  {showIncompleteItems ? (
                                    <ChevronUp size={16} style={{ color: '#92400e' }} />
                                  ) : (
                                    <ChevronDown size={16} style={{ color: '#92400e' }} />
                                  )}
                                </div>
                                {showIncompleteItems && (
                                  <div style={{ marginTop: '8px' }}>
                                    {memberIncompleteItems.map((item: any) => {
                                      const isItemExpanded = expandedWorkItems.has(item.id);
                                      const itemDate = item.checkin_date ? new Date(item.checkin_date).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) : '未知';
                                      
                                      return (
                                        <div 
                                          key={item.id}
                                          id={`work-item-${item.id}`}
                                          style={{ 
                                            marginBottom: '8px',
                                            backgroundColor: '#fefce8',
                                            borderRadius: '6px',
                                            borderLeft: '3px solid #f59e0b',
                                            overflow: 'hidden',
                                            transition: 'background-color 0.3s ease'
                                          }}
                                        >
                                          <div
                                            style={{
                                              padding: '10px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              cursor: 'pointer'
                                            }}
                                            onClick={(e) => {
                                              // Don't toggle if clicking on reassign button area
                                              if ((e.target as HTMLElement).closest('.reassign-area')) {
                                                return;
                                              }
                                              const newExpanded = new Set(expandedWorkItems);
                                              if (isItemExpanded) {
                                                newExpanded.delete(item.id);
                                              } else {
                                                newExpanded.add(item.id);
                                              }
                                              setExpandedWorkItems(newExpanded);
                                            }}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                              {isItemExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                              <div style={{ fontWeight: '600', fontSize: '14px' }}>
                                                {item.ai_title || item.content}
                                              </div>
                                              {getPriorityBadge(item.priority)}
                                              {(() => {
                                                const statusBadge = getStatusBadge(item.progress_status);
                                                return (
                                                  <span
                                                    style={{
                                                      display: 'inline-flex',
                                                      alignItems: 'center',
                                                      gap: '4px',
                                                      padding: '2px 8px',
                                                      borderRadius: '12px',
                                                      fontSize: '11px',
                                                      fontWeight: '500',
                                                      color: statusBadge.color,
                                                      backgroundColor: statusBadge.bgColor
                                                    }}
                                                  >
                                                    {statusBadge.icon}
                                                    {statusBadge.text}
                                                  </span>
                                                );
                                              })()}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                              <div style={{ fontSize: '11px', color: '#92400e' }}>
                                                📅 {itemDate}
                                              </div>
                                              <div className="reassign-area" style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                  className="btn btn-secondary"
                                                  style={{ fontSize: '11px', padding: '4px 8px' }}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openPriorityModal(item);
                                                  }}
                                                  title="設定優先級"
                                                >
                                                  🎯
                                                </button>
                                                <button
                                                  className="btn btn-secondary"
                                                  style={{ fontSize: '11px', padding: '4px 8px' }}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openHandlerModal(item);
                                                  }}
                                                  title="設定處理人"
                                                >
                                                  <UserPlus size={12} />
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                          
                                          {isItemExpanded && (
                                            <div style={{ padding: '0 10px 10px 10px', borderTop: '1px solid #fef3c7' }}>
                                              {/* 處理人信息 */}
                                              <div style={{ marginTop: '8px', marginBottom: '8px', fontSize: '13px' }}>
                                                <div style={{ marginBottom: '4px' }}>
                                                  <strong style={{ color: '#f59e0b' }}>主要處理人：</strong>
                                                  {item.handlers?.primary ? (
                                                    <span style={{ marginLeft: '4px' }}>
                                                      {item.handlers.primary.display_name || item.handlers.primary.username}
                                                    </span>
                                                  ) : (
                                                    <span style={{ marginLeft: '4px', color: '#999' }}>未指定</span>
                                                  )}
                                                </div>
                                                {item.handlers?.co_handlers && item.handlers.co_handlers.length > 0 && (
                                                  <div>
                                                    <strong style={{ color: '#f59e0b' }}>共同處理人：</strong>
                                                    <span style={{ marginLeft: '4px' }}>
                                                      {item.handlers.co_handlers.map((h: any) => h.display_name || h.username).join(', ')}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                              
                                              {item.ai_summary && (
                                                <div style={{
                                                  padding: '8px',
                                                  backgroundColor: '#fffbeb',
                                                  borderRadius: '4px',
                                                  marginTop: '8px'
                                                }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                                    <Sparkles size={12} style={{ color: '#f59e0b', marginRight: '4px' }} />
                                                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#f59e0b' }}>AI 摘要</span>
                                                  </div>
                                                  <div className="markdown-content" style={{ fontSize: '13px', lineHeight: '1.5', color: '#92400e' }}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.ai_summary}</ReactMarkdown>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          
                          {/* 共同處理項目區塊 */}
                          {(() => {
                            const coHandlerTodayItems = getUserCoHandlerWorkItems(member.user_id);
                            const coHandlerIncompleteItems = getUserCoHandlerIncompleteItems(member.user_id);
                            const totalCoHandlerItems = coHandlerTodayItems.length + coHandlerIncompleteItems.length;
                            
                            if (totalCoHandlerItems === 0) return null;
                            
                            // 使用負數 ID 來區分共同處理項目的展開狀態
                            const coHandlerExpandId = -(member.user_id * 1000);
                            
                            return (
                              <>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    marginTop: '12px',
                                    marginBottom: '8px',
                                    padding: '8px',
                                    backgroundColor: '#f0f9ff',
                                    borderRadius: '6px',
                                    border: '1px solid #bfdbfe'
                                  }}
                                  onClick={() => {
                                    const newExpanded = new Set(expandedWorkItems);
                                    if (newExpanded.has(coHandlerExpandId)) {
                                      newExpanded.delete(coHandlerExpandId);
                                    } else {
                                      newExpanded.add(coHandlerExpandId);
                                    }
                                    setExpandedWorkItems(newExpanded);
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {expandedWorkItems.has(coHandlerExpandId) ? 
                                      <ChevronUp size={16} style={{ color: '#0066cc' }} /> : 
                                      <ChevronDown size={16} style={{ color: '#0066cc' }} />
                                    }
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#0066cc' }}>
                                      共同處理項目
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#0066cc', backgroundColor: '#dbeafe', padding: '2px 6px', borderRadius: '10px' }}>
                                      {totalCoHandlerItems}
                                    </span>
                                  </div>
                                </div>
                                
                                {expandedWorkItems.has(coHandlerExpandId) && (
                                  <div style={{ paddingLeft: '10px', marginBottom: '10px' }}>
                                    {/* 今日共同處理項目 */}
                                    {coHandlerTodayItems.length > 0 && (
                                      <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '12px', color: '#0066cc', marginBottom: '6px', fontWeight: '600' }}>
                                          今日項目 ({coHandlerTodayItems.length})
                                        </div>
                                        {coHandlerTodayItems.map((item) => {
                                          // 共同處理項目使用不同的展開 ID，避免與原始項目連動
                                          const coHandlerExpandKey = `co-handler-${item.id}`;
                                          const isItemExpanded = expandedWorkItems.has(coHandlerExpandKey);
                                          const primaryUser = item.handlers?.primary;
                                          const otherCoHandlers = item.handlers?.co_handlers?.filter(
                                            (h: any) => h.user_id !== member.user_id
                                          ) || [];
                                          
                                          return (
                                            <div
                                              key={item.id}
                                              style={{
                                                marginBottom: '6px',
                                                padding: '8px',
                                                backgroundColor: '#ffffff',
                                                borderRadius: '4px',
                                                border: '1px solid #bfdbfe'
                                              }}
                                            >
                                              <div
                                                style={{
                                                  display: 'flex',
                                                  justifyContent: 'space-between',
                                                  alignItems: 'center',
                                                  cursor: 'pointer'
                                                }}
                                                onClick={(e) => {
                                                  if ((e.target as HTMLElement).closest('.jump-to-original')) {
                                                    return;
                                                  }
                                                  const newExpanded = new Set(expandedWorkItems);
                                                  if (isItemExpanded) {
                                                    newExpanded.delete(coHandlerExpandKey);
                                                  } else {
                                                    newExpanded.add(coHandlerExpandKey);
                                                  }
                                                  // 只展開/收起共同處理項目本身，不影響原始項目
                                                  setExpandedWorkItems(newExpanded);
                                                }}
                                              >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                                  {isItemExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                  <div style={{ fontSize: '13px', flex: 1 }}>
                                                    {item.ai_title || item.content.substring(0, 50)}...
                                                  </div>
                                                  {getPriorityBadge(item.priority)}
                                                  {(() => {
                                                    const statusBadge = getStatusBadge(item.progress_status);
                                                    return (
                                                      <span
                                                        style={{
                                                          display: 'inline-flex',
                                                          alignItems: 'center',
                                                          gap: '3px',
                                                          padding: '1px 6px',
                                                          borderRadius: '10px',
                                                          fontSize: '10px',
                                                          fontWeight: '500',
                                                          color: statusBadge.color,
                                                          backgroundColor: statusBadge.bgColor
                                                        }}
                                                      >
                                                        {statusBadge.icon}
                                                        {statusBadge.text}
                                                      </span>
                                                    );
                                                  })()}
                                                </div>
                                                <button
                                                  className="jump-to-original"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (primaryUser) {
                                                      scrollToOriginalItem(item.id, primaryUser.user_id);
                                                    }
                                                  }}
                                                  style={{
                                                    background: 'none',
                                                    border: '1px solid #0066cc',
                                                    color: '#0066cc',
                                                    cursor: 'pointer',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '10px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '2px'
                                                  }}
                                                  title="跳轉到原始項目"
                                                >
                                                  📍 定位
                                                </button>
                                              </div>
                                              
                                              {isItemExpanded && (
                                                <div style={{ padding: '8px 0 0 20px', borderTop: '1px solid #e5e7eb', marginTop: '6px' }}>
                                                  {/* 處理人資訊 */}
                                                  <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                                                    <div style={{ marginBottom: '4px', color: '#0066cc' }}>
                                                      <strong>主要處理人：</strong>
                                                      <span style={{ marginLeft: '4px' }}>
                                                        {primaryUser?.display_name || primaryUser?.username || '未指定'}
                                                      </span>
                                                    </div>
                                                    {otherCoHandlers.length > 0 && (
                                                      <div style={{ color: '#0066cc' }}>
                                                        <strong>其他共同處理人：</strong>
                                                        <span style={{ marginLeft: '4px' }}>
                                                          {otherCoHandlers.map((h: any) => h.display_name || h.username).join(', ')}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                  {/* 工作內容 */}
                                                  <div className="markdown-content" style={{ fontSize: '12px', lineHeight: '1.5', color: '#555' }}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                      {item.ai_summary || item.content}
                                                    </ReactMarkdown>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    
                                    {/* 未完成共同處理項目 */}
                                    {coHandlerIncompleteItems.length > 0 && (
                                      <div>
                                        <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '6px', fontWeight: '600' }}>
                                          未完成項目 ({coHandlerIncompleteItems.length})
                                        </div>
                                        {coHandlerIncompleteItems.map((item: any) => {
                                          // 共同處理項目使用不同的展開 ID，避免與原始項目連動
                                          const coHandlerExpandKey = `co-handler-${item.id}`;
                                          const isItemExpanded = expandedWorkItems.has(coHandlerExpandKey);
                                          const itemDate = item.checkin_date ? new Date(item.checkin_date).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) : new Date(item.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
                                          const primaryUser = item.handlers?.primary;
                                          const otherCoHandlers = item.handlers?.co_handlers?.filter(
                                            (h: any) => h.user_id !== member.user_id
                                          ) || [];
                                          
                                          return (
                                            <div
                                              key={item.id}
                                              style={{
                                                marginBottom: '6px',
                                                padding: '8px',
                                                backgroundColor: '#ffffff',
                                                borderRadius: '4px',
                                                border: '1px solid #fed7aa'
                                              }}
                                            >
                                              <div
                                                style={{
                                                  display: 'flex',
                                                  justifyContent: 'space-between',
                                                  alignItems: 'center',
                                                  cursor: 'pointer'
                                                }}
                                                onClick={(e) => {
                                                  if ((e.target as HTMLElement).closest('.jump-to-original')) {
                                                    return;
                                                  }
                                                  const newExpanded = new Set(expandedWorkItems);
                                                  if (isItemExpanded) {
                                                    newExpanded.delete(coHandlerExpandKey);
                                                  } else {
                                                    newExpanded.add(coHandlerExpandKey);
                                                  }
                                                  // 只展開/收起共同處理項目本身，不影響原始項目
                                                  setExpandedWorkItems(newExpanded);
                                                }}
                                              >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                                  {isItemExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                  <div style={{ fontSize: '13px', flex: 1 }}>
                                                    {item.ai_title || item.content.substring(0, 50)}...
                                                  </div>
                                                  {getPriorityBadge(item.priority)}
                                                  {(() => {
                                                    const statusBadge = getStatusBadge(item.progress_status);
                                                    return (
                                                      <span
                                                        style={{
                                                          display: 'inline-flex',
                                                          alignItems: 'center',
                                                          gap: '3px',
                                                          padding: '1px 6px',
                                                          borderRadius: '10px',
                                                          fontSize: '10px',
                                                          fontWeight: '500',
                                                          color: statusBadge.color,
                                                          backgroundColor: statusBadge.bgColor
                                                        }}
                                                      >
                                                        {statusBadge.icon}
                                                        {statusBadge.text}
                                                      </span>
                                                    );
                                                  })()}
                                                  <div style={{ fontSize: '11px', color: '#f59e0b', whiteSpace: 'nowrap', marginLeft: '6px' }}>
                                                    📅 {itemDate}
                                                  </div>
                                                </div>
                                                <button
                                                  className="jump-to-original"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (primaryUser) {
                                                      scrollToOriginalItem(item.id, primaryUser.user_id);
                                                    }
                                                  }}
                                                  style={{
                                                    background: 'none',
                                                    border: '1px solid #f59e0b',
                                                    color: '#f59e0b',
                                                    cursor: 'pointer',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '10px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    marginLeft: '6px'
                                                  }}
                                                  title="跳轉到原始項目"
                                                >
                                                  📍 定位
                                                </button>
                                              </div>
                                              
                                              {isItemExpanded && (
                                                <div style={{ padding: '8px 0 0 20px', borderTop: '1px solid #fef3c7', marginTop: '6px' }}>
                                                  {/* 處理人資訊 */}
                                                  <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                                                    <div style={{ marginBottom: '4px', color: '#f59e0b' }}>
                                                      <strong>主要處理人：</strong>
                                                      <span style={{ marginLeft: '4px' }}>
                                                        {primaryUser?.display_name || primaryUser?.username || '未指定'}
                                                      </span>
                                                    </div>
                                                    {otherCoHandlers.length > 0 && (
                                                      <div style={{ color: '#f59e0b' }}>
                                                        <strong>其他共同處理人：</strong>
                                                        <span style={{ marginLeft: '4px' }}>
                                                          {otherCoHandlers.map((h: any) => h.display_name || h.username).join(', ')}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                  {/* 工作內容 */}
                                                  <div className="markdown-content" style={{ fontSize: '12px', lineHeight: '1.5', color: '#92400e' }}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                      {item.ai_summary || item.content}
                                                    </ReactMarkdown>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 使用提示 */}
        <div className="card" style={{ marginTop: '20px', backgroundColor: '#f8f9fa' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>💡 使用提示</h3>
          <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#666' }}>
            <li>查看團隊成員今日打卡狀況與工作項目</li>
            <li>點擊「AI 分析工作分配」讓 AI 分析團隊工作負載</li>
            <li>AI 會提供工作分配建議、識別潛在問題和優先級建議</li>
            <li>適合在每日站立會議時使用，快速了解團隊狀況</li>
          </ul>
        </div>

        {/* 處理人設定 Modal */}
        {showHandlerModal && editingWorkItem && (
          <div 
            className="modal-overlay" 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowHandlerModal(false)}
          >
            <div 
              className="modal-content card" 
              style={{
                width: '90%',
                maxWidth: '500px',
                padding: '24px',
                maxHeight: '80vh',
                overflowY: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginBottom: '20px', fontSize: '18px' }}>
                設定處理人：{editingWorkItem.ai_title || editingWorkItem.content.substring(0, 30) + '...'}
              </h3>

              {/* 主要處理人 */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: '#333'
                }}>
                  主要處理人
                </label>
                <select
                  className="input"
                  value={selectedPrimaryHandler || ''}
                  onChange={(e) => setSelectedPrimaryHandler(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                >
                  <option value="">請選擇主要處理人</option>
                  {teamMembers.map(member => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name || member.username}
                    </option>
                  ))}
                </select>
              </div>

              {/* 共同處理人 */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: '#333'
                }}>
                  共同處理人（可選多人）
                </label>
                <div style={{ 
                  border: '1px solid #ddd', 
                  borderRadius: '4px', 
                  padding: '12px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  backgroundColor: '#f9f9f9'
                }}>
                  {teamMembers
                    .filter(member => member.user_id !== selectedPrimaryHandler)
                    .map(member => (
                      <label 
                        key={member.user_id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          padding: '6px 0',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCoHandlers.includes(member.user_id)}
                          onChange={() => toggleCoHandler(member.user_id)}
                          style={{ marginRight: '8px', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '14px' }}>
                          {member.display_name || member.username}
                        </span>
                      </label>
                    ))}
                  {teamMembers.filter(m => m.user_id !== selectedPrimaryHandler).length === 0 && (
                    <div style={{ color: '#999', fontSize: '14px' }}>
                      請先選擇主要處理人
                    </div>
                  )}
                </div>
              </div>

              {/* 按鈕 */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowHandlerModal(false)}
                >
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveHandlers}
                  disabled={!selectedPrimaryHandler}
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 優先級設定 Modal */}
        {showPriorityModal && editingWorkItem && (
          <div 
            className="modal-overlay" 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => setShowPriorityModal(false)}
          >
            <div 
              className="modal-content card" 
              style={{
                width: '90%',
                maxWidth: '400px',
                padding: '24px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ marginBottom: '20px', fontSize: '18px' }}>
                設定優先級：{editingWorkItem.ai_title || editingWorkItem.content.substring(0, 30) + '...'}
              </h3>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: '#333'
                }}>
                  優先級
                </label>
                <select
                  className="input"
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(parseInt(e.target.value))}
                  style={{ width: '100%', fontSize: '16px', padding: '12px' }}
                >
                  <option value={1}>🔴 最高</option>
                  <option value={2}>🟠 高</option>
                  <option value={3}>🟡 中</option>
                  <option value={4}>🟢 低</option>
                  <option value={5}>🔵 最低</option>
                </select>
              </div>

              {/* 按鈕 */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowPriorityModal(false)}
                >
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSavePriority}
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default StandupReview;
