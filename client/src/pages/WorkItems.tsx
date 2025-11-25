import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ArrowLeft, Send, Trash2, Edit2, Sparkles, Save, X, ChevronDown, ChevronUp, Calendar, Search, Undo2, Loader2, LayoutGrid, AlignJustify } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';
import PriorityBadge from '../components/PriorityBadge';

interface WorkItemsProps {
  user: any;
  teamId: number;
  onLogout: () => void;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  author?: string;
}

interface WorkItem {
  id: number;
  content: string;
  item_type: string;
  created_at: string;
  priority?: number;
  estimated_date?: string;
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

function WorkItems({ user, teamId }: WorkItemsProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [checkinId, setCheckinId] = useState<number | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [incompleteItems, setIncompleteItems] = useState<WorkItem[]>([]);
  const [backlogItems, setBacklogItems] = useState<any[]>([]);
  const [currentItemAiSummary, setCurrentItemAiSummary] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<number>(3);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showIncomplete, setShowIncomplete] = useState(true);
  const [showBacklog, setShowBacklog] = useState(false);
  const [enlargedTable, setEnlargedTable] = useState<string | null>(null);
  const currentUserId = user?.id as number | undefined;
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showCoHandlerDialog, setShowCoHandlerDialog] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'priority' | 'estimated_date'>('priority');
  const [searchQuery, setSearchQuery] = useState('');
  const [backlogSearchQuery, setBacklogSearchQuery] = useState('');
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [forceSingleColumn, setForceSingleColumn] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const useSingleColumn = isCompactLayout || forceSingleColumn;
  const layoutLabel = forceSingleColumn ? '單欄 (手動)' : isCompactLayout ? '單欄 (自動)' : '雙欄';

  const isBacklogOwner = (item: { user_id?: number }) =>
    typeof currentUserId === 'number' && typeof item?.user_id === 'number' && item.user_id === currentUserId;

  const getBacklogOwnerLabel = (item: { user_id?: number; display_name?: string; username?: string }) => {
    if (isBacklogOwner(item)) {
      return '你';
    }
    if (item.display_name || item.username) {
      return item.display_name || item.username || '';
    }
    return typeof item.user_id === 'number' ? `成員 #${item.user_id}` : '未指定';
  };

  const getWorkItemOwnerLabel = (item: any) => {
    const primary = item?.handlers?.primary;
    if (primary && typeof currentUserId === 'number' && primary.user_id === currentUserId) {
      return '你';
    }
    if (primary) {
      const fallback = typeof primary.user_id === 'number' ? `成員 #${primary.user_id}` : '未指定';
      return primary.display_name || primary.username || fallback;
    }
    return '未指定';
  };

  const normalizeEstimatedDate = (value?: string | null) => {
    if (!value) {
      return null;
    }
    return value.includes('T') ? value.split('T')[0] : value;
  };

  // Filter function for work items search
  const filterWorkItems = (items: WorkItem[]): WorkItem[] => {
    if (!searchQuery.trim()) return items;

    const query = searchQuery.toLowerCase();
    const numericQuery = query.replace(/#/g, '').trim();
    return items.filter(item => {
      const title = (item.ai_title || '').toLowerCase();
      const content = item.content.toLowerCase();
      const summary = (item.ai_summary || '').toLowerCase();
      const idLabel = `#${item.id}`.toLowerCase();
      const idMatches = idLabel.includes(query) || (numericQuery ? String(item.id).includes(numericQuery) : false);
      return idMatches || title.includes(query) || content.includes(query) || summary.includes(query);
    });
  };

  // Filter function for backlog items search
  const filterBacklogItems = (items: any[]): any[] => {
    if (!backlogSearchQuery.trim()) return items;

    const query = backlogSearchQuery.toLowerCase();
    const numericQuery = query.replace(/#/g, '').trim();
    return items.filter(item => {
      const title = (item.ai_title || '').toLowerCase();
      const content = item.content.toLowerCase();
      const idLabel = `#${item.id}`.toLowerCase();
      const idMatches = idLabel.includes(query) || (numericQuery ? String(item.id).includes(numericQuery) : false);
      return idMatches || title.includes(query) || content.includes(query);
    });
  };

  // Sorting function
  const sortItems = <T extends WorkItem>(items: T[]): T[] => {
    const sorted = [...items];

    if (sortBy === 'priority') {
      sorted.sort((a, b) => (a.priority || 3) - (b.priority || 3));
    } else {
      // Sort by estimated_date: items without date go to bottom
      sorted.sort((a, b) => {
        const dateA = normalizeEstimatedDate(a.estimated_date || null);
        const dateB = normalizeEstimatedDate(b.estimated_date || null);

        if (!dateA && !dateB) return (a.priority || 3) - (b.priority || 3);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      });
    }

    return sorted;
  };

  useEffect(() => {
    if (!teamId) {
      setWorkItems([]);
      setIncompleteItems([]);
      setBacklogItems([]);
      setTeamMembers([]);
      return;
    }

    loadTodayCheckin();
    loadWorkItems();
    loadIncompleteItems();
    loadBacklogItems();
    loadTeamMembers();
    setSelectedItemId(null);
    setSessionId('');
    setCurrentItemAiSummary('');
    setSelectedPriority(3);
    setMessages([{
      role: 'ai',
      content: '您好！我會協助您規劃今日的工作項目。請告訴我您今天計劃想完成的工作？',
      timestamp: new Date().toISOString(),
      author: 'AI 助手'
    }]);
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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const updateLayout = () => {
      setIsCompactLayout(window.innerWidth < 1400);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const loadTodayCheckin = async () => {
    try {
      const checkins = await api.getTodayTeamCheckins(teamId);
      const userCheckin = checkins.find((c: any) => c.user_id === user.id);
      if (userCheckin) {
        setCheckinId(userCheckin.id);
      }
    } catch (error) {
      console.error('Failed to load checkin:', error);
    }
  };

  const loadWorkItems = async () => {
    try {
      const items = await api.getTodayWorkItems(teamId);
      // 只顯示用戶作為主要處理人的項目
      const filteredItems = items.filter((item: any) =>
        item.handlers?.primary?.user_id === user.id
      );
      setWorkItems(filteredItems);
    } catch (error) {
      console.error('Failed to load work items:', error);
    }
  };

  const loadIncompleteItems = async () => {
    try {
      const items = await api.getIncompleteWorkItems(teamId);
      // Backend now filters out today's items automatically
      // 只顯示用戶作為主要處理人的項目
      const filteredItems = items.filter((item: any) =>
        item.handlers?.primary?.user_id === user.id
      );
      setIncompleteItems(filteredItems);
    } catch (error) {
      console.error('Failed to load incomplete items:', error);
    }
  };

  const loadBacklogItems = async () => {
    try {
      const items = await api.getUserBacklogItems(teamId);
      setBacklogItems(items);
    } catch (error) {
      console.error('Failed to load backlog items:', error);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const members = await api.getTeamMembers(teamId);
      setTeamMembers(members);
    } catch (error) {
      console.error('Failed to load team members:', error);
    }
  };

  const loadChatHistory = async (itemSessionId: string): Promise<boolean> => {
    try {
      const history = await api.getChatHistory(itemSessionId);
      const formattedMessages: ChatMessage[] = [];

      history.forEach((msg: any) => {
        const authorLabel =
          msg.display_name || msg.username
            ? (msg.display_name || msg.username)
            : '使用者';

        formattedMessages.push({
          role: 'user',
          content: msg.content,
          timestamp: msg.created_at,
          author: authorLabel
        });
        if (msg.ai_response) {
          formattedMessages.push({
            role: 'ai',
            content: msg.ai_response,
            timestamp: msg.created_at,
            author: 'AI 助手'
          });
        }
      });

      setMessages(formattedMessages);
      return formattedMessages.length > 0;
    } catch (error) {
      console.error('Failed to load chat history:', error);
      return false;
    }
  };

  const handleDeleteWorkItem = async (itemId: number) => {
    if (!confirm('確定要刪除此工作項目嗎？')) return;

    try {
      await api.deleteWorkItem(itemId);
      await loadWorkItems();

      if (selectedItemId === itemId) {
        setSelectedItemId(null);
        setCurrentItemAiSummary('');
        setSessionId('');
        setMessages([{
          role: 'ai',
          content: '您好！我會協助您規劃今日的工作項目。請告訴我您今天計劃想完成的工作？',
          timestamp: new Date().toISOString(),
          author: 'AI 助手'
        }]);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || '刪除失敗');
    }
  };

  const handleMoveWorkItemToBacklog = async (item: WorkItem) => {
    if (!confirm(`確定要將「${item.ai_title || item.content}」轉回 Backlog 嗎？`)) {
      return;
    }

    try {
      await api.moveWorkItemToBacklog(item.id);
      await Promise.all([loadWorkItems(), loadIncompleteItems(), loadBacklogItems()]);
      setExpandedItems((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      alert('已轉回 Backlog，可在下方 Backlog 清單中繼續規劃。');
    } catch (error: any) {
      console.error('Move work item to backlog error:', error);
      alert(error.response?.data?.error || '轉回 Backlog 失敗');
    }
  };

  const handleAddCoHandler = async (itemId: number, userId: number) => {
    try {
      await api.addCoHandler(itemId, userId);
      await loadWorkItems();
      setShowCoHandlerDialog(null);
      alert('已成功添加共同處理人');
    } catch (error: any) {
      alert(error.response?.data?.error || '添加共同處理人失敗');
    }
  };

  const handleRemoveCoHandler = async (itemId: number, userId: number) => {
    if (!confirm('確定要移除此共同處理人嗎？')) return;

    try {
      await api.removeCoHandler(itemId, userId);
      await loadWorkItems();
      alert('已成功移除共同處理人');
    } catch (error: any) {
      alert(error.response?.data?.error || '移除共同處理人失敗');
    }
  };

  const handleEditWorkItem = async (item: WorkItem) => {
    setSelectedItemId(item.id);
    setCurrentItemAiSummary(item.ai_summary || '');
    setSelectedPriority(item.priority || 3);

    console.log('[WorkItems] Editing item:', item.id, 'existing session_id:', item.session_id);

    if (item.session_id) {
      setSessionId(item.session_id);
      console.log('[WorkItems] Using existing session:', item.session_id);
      await loadChatHistory(item.session_id);
    } else {
      // Create a new session ID for items without one
      const newSessionId = `session_${Date.now()}_${user.id}`;
      setSessionId(newSessionId);
      console.log('[WorkItems] Created new session:', newSessionId);
      setMessages([{
        role: 'ai',
        content: `正在編輯工作項目：「${item.ai_title || item.content}」\n\n您可以繼續與我討論這個項目的細節。`,
        timestamp: new Date().toISOString(),
        author: 'AI 助手'
      }]);
    }
  };

  const handleSend = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString(),
      author: user.display_name || user.username || '你'
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputMessage;
    setInputMessage('');
    setLoading(true);

    try {
      console.log('[WorkItems] Sending message with sessionId:', sessionId);
      const response = await api.chat(currentInput, sessionId, { teamId, userId: user.id });
      console.log('[WorkItems] Chat response sessionId:', response.sessionId);
      setSessionId(response.sessionId);

      const aiMessage: ChatMessage = {
        role: 'ai',
        content: response.response,
        timestamp: response.timestamp,
        author: 'AI 助手'
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'ai',
        content: '抱歉，發生錯誤。請稍後再試。',
        timestamp: new Date().toISOString(),
        author: 'AI 助手'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsNewWorkItem = async () => {
    if (!checkinId) {
      alert('請先完成打卡');
      return;
    }

    if (!sessionId) {
      alert('請先與 AI 進行對話');
      return;
    }

    try {
      setLoading(true);
      const summary = await api.generateWorkSummary(sessionId);

      // 確保 summary 是字串
      const summaryText = typeof summary.summary === 'string'
        ? summary.summary
        : JSON.stringify(summary.summary);
      const titleText = typeof summary.title === 'string'
        ? summary.title
        : JSON.stringify(summary.title);

      await api.createWorkItem(
        checkinId,
        summaryText,
        'task',
        sessionId,
        summaryText,
        titleText,
        selectedPriority
      );

      alert('工作項目已儲存！');

      await loadWorkItems();
      setSessionId('');
      setSelectedItemId(null);
      setCurrentItemAiSummary('');
      setSelectedPriority(3);
      setMessages([{
        role: 'ai',
        content: '✅ 工作項目已成功儲存！\n\n您可以繼續新增其他工作項目。',
        timestamp: new Date().toISOString(),
        author: 'AI 助手'
      }]);
    } catch (error) {
      console.error('Failed to save work item:', error);
      alert('儲存失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateWorkItem = async () => {
    if (!selectedItemId) return;

    if (!sessionId) {
      alert('請先與 AI 進行對話以更新項目內容');
      return;
    }

    // Check if user has sent at least one message
    const hasUserMessages = messages.some(msg => msg.role === 'user');
    if (!hasUserMessages) {
      alert('請先與 AI 討論項目內容後再更新');
      return;
    }

    try {
      setLoading(true);
      console.log('[WorkItems] Generating summary with sessionId:', sessionId);
      const summary = await api.generateWorkSummary(sessionId);
      console.log('[WorkItems] Generated summary:', summary);

      // Validate that summary was generated successfully
      if (!summary || !summary.summary) {
        throw new Error('生成摘要失敗：摘要內容為空');
      }

      // Check if it's the default error message
      if (summary.summary === '無對話記錄') {
        console.error('[WorkItems] No chat history found for session:', sessionId);
        console.error('[WorkItems] Current messages:', messages);
        throw new Error('無法找到對話記錄，請確保已與 AI 進行對話。如果問題持續，請重新整理頁面後再試。');
      }

      await api.updateWorkItem(selectedItemId, {
        content: summary.summary,
        aiSummary: summary.summary,
        aiTitle: summary.title,
        priority: selectedPriority,
        sessionId: sessionId  // 關聯 AI 對話記錄
      });

      // Reload both lists so the latest content appears in today's + incomplete sections
      await Promise.all([loadWorkItems(), loadIncompleteItems()]);

      // Clear edit mode states
      setSessionId('');
      setSelectedItemId(null);
      setSelectedPriority(3);

      // Keep the summary visible so user can see what was saved
      setCurrentItemAiSummary(summary.summary);

      setMessages([{
        role: 'ai',
        content: '✅ 工作項目已更新！\n\n您可以繼續新增或編輯其他工作項目。',
        timestamp: new Date().toISOString(),
        author: 'AI 助手'
      }]);

      alert('工作項目已更新！');
    } catch (error: any) {
      console.error('Failed to update work item:', error);
      alert(error.message || '更新失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setSelectedItemId(null);
    setSessionId('');
    setCurrentItemAiSummary('');
    setSelectedPriority(3);
    setMessages([{
      role: 'ai',
      content: '已取消編輯。您可以新增其他工作項目或編輯現有項目。',
      timestamp: new Date().toISOString(),
      author: 'AI 助手'
    }]);
  };

  const handleMoveIncompleteToToday = async (item: any) => {
    if (!checkinId) {
      alert('請先完成打卡');
      return;
    }

    try {
      setLoading(true);

      // 呼叫移動 API（不是複製，是移動）
      await api.moveWorkItemToToday(item.id);

      alert('已移動到今日工作項目！');

      // 重新載入列表
      await loadWorkItems();
      await loadIncompleteItems();
    } catch (error: any) {
      console.error('Failed to move item to today:', error);
      const errorMsg = error.response?.data?.error || '移動失敗';
      alert(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 從 Backlog 加入今日工作項目（會用標題開啟 AI 對談）
  const handleAddBacklogToToday = async (backlogItem: any) => {
    if (!checkinId) {
      alert('請先完成打卡');
      return;
    }

    if (!confirm(`確定要將「${backlogItem.ai_title || backlogItem.content}」加入今日工作項目嗎？\n\n這會使用項目標題開啟 AI 對談，讓您進一步完善工作內容。`)) return;

    try {
      setLoading(true);

      // 移動 Backlog 項目到今日工作（後端會更新 is_backlog = false 和綁定 checkin_id）
      const movedItem = await api.moveBacklogToWorkItem(backlogItem.id, teamId);

      // 重新載入所有列表
      await Promise.all([
        loadWorkItems(),
        loadIncompleteItems(),
        loadBacklogItems()
      ]);

      // 使用 Backlog 項目的標題作為第一次 AI 對談
      const backlogTitle = backlogItem.ai_title || backlogItem.content;
      const sessionFromBackend = movedItem.session_id;

      if (!sessionFromBackend) {
        throw new Error('無法取得 AI 對談 Session，請稍後再試');
      }

      // 設定為編輯模式，而不是新增模式
      // 這樣儲存時會更新現有項目，而不是創建新項目
      setSelectedItemId(movedItem.id);  // 設置選中的項目 ID
      setCurrentItemAiSummary(movedItem.ai_summary || backlogItem.ai_summary || backlogItem.content);
      setSelectedPriority(movedItem.priority || backlogItem.priority || 3);
      setSessionId(sessionFromBackend);

      // 優先載入既有對談紀錄，無紀錄時才啟動新的 AI 對話
      const hasHistory = await loadChatHistory(sessionFromBackend);
      if (!hasHistory) {
        setMessages([{
          role: 'ai',
          content: '您好！我會協助您規劃今日的工作項目。請告訴我您今天計劃想完成的工作？',
          timestamp: new Date().toISOString(),
          author: 'AI 助手'
        }]);

        // 自動發送 Backlog 標題作為第一次對談
        setInputMessage(backlogTitle);

        // 稍作延遲後自動送出（確保 UI 已更新）
        setTimeout(() => {
          handleSend();
        }, 100);
      } else {
        setInputMessage('');
      }

      alert('Backlog 項目已加入今日工作！既有的 AI 對談已保留，完成討論後請點擊「更新此工作項目」。');
    } catch (error: any) {
      console.error('Failed to add backlog to today:', error);
      const errorMsg = error.response?.data?.error || '加入失敗';
      alert(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="main-content">
        <Breadcrumbs />
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={18} />
              返回
            </button>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MessageSquare size={28} />
              AI 工作項目規劃
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button className="btn btn-success" onClick={() => navigate('/backlog')}>
              <Calendar size={18} />
              Backlog 規劃
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setForceSingleColumn(prev => !prev)}
              title="切換單欄 / 雙欄，視窗較窄時會自動改為單欄"
              aria-label={`切換排版：${layoutLabel}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 10px' }}
            >
              {useSingleColumn ? <AlignJustify size={18} /> : <LayoutGrid size={18} />}
              <span style={{ fontSize: '12px', color: '#374151', fontWeight: 600 }}>{layoutLabel}</span>
            </button>
            <div style={{ fontSize: '14px', color: '#666' }}>
              {user.display_name || user.username}
            </div>
          </div>
        </div>

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

        {/* Main Content */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: useSingleColumn ? '1fr' : '60% 38%',
          gap: useSingleColumn ? '16px' : '20px',
          minHeight: useSingleColumn ? 'auto' : 'calc(100vh - 250px)',
          alignItems: 'start'
        }}>
          {/* Left: Chat Dialog - 60% */}
          <div className="card" style={{
            display: 'flex',
            flexDirection: 'column',
            height: useSingleColumn ? 'auto' : 'calc(100vh - 250px)',
            position: useSingleColumn ? 'static' : 'sticky',
            top: useSingleColumn ? undefined : '20px'
          }}>
            {/* Chat Header */}
            <div style={{ padding: '15px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Sparkles size={20} style={{ color: '#667eea' }} />
                AI 助手對話
                {selectedItemId && (
                  <span style={{ marginLeft: '10px', fontSize: '14px', color: '#667eea' }}>(編輯模式)</span>
                )}
              </h3>
              {selectedItemId && (
                <p style={{ fontSize: '13px', color: '#666', marginTop: '5px', marginBottom: 0 }}>
                  正在編輯工作項目 #{selectedItemId}
                </p>
              )}
            </div>

            {/* Chat Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              minHeight: useSingleColumn ? '260px' : undefined,
              maxHeight: useSingleColumn ? '60vh' : undefined
            }}>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: '15px'
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      backgroundColor: msg.role === 'user' ? '#667eea' : '#f3f4f6',
                      color: msg.role === 'user' ? 'white' : '#374151'
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', opacity: 0.9 }}>
                      {msg.author || (msg.role === 'ai' ? 'AI 助手' : '使用者')}
                    </div>
                    {msg.role === 'ai' ? (
                      <div className="markdown-content" style={{ fontSize: '14px', lineHeight: '1.6' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p style={{ fontSize: '14px', whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                    )}
                    <div
                      style={{
                        fontSize: '11px',
                        marginTop: '8px',
                        opacity: 0.7
                      }}
                    >
                      {new Date(msg.timestamp).toLocaleString('zh-TW', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div style={{ padding: '15px', borderTop: '1px solid #e5e7eb' }}>
              {/* Priority Selector */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
                  優先級：
                </label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(parseInt(e.target.value))}
                  className="form-control"
                  style={{ width: '100%', padding: '8px' }}
                >
                  <option value={1}>🔴 最高優先級 (1)</option>
                  <option value={2}>🟠 高優先級 (2)</option>
                  <option value={3}>🟡 中優先級 (3)</option>
                  <option value={4}>🟢 低優先級 (4)</option>
                  <option value={5}>🔵 最低優先級 (5)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <textarea
                  className="input"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="描述您的工作項目...（Enter 換行）"
                  disabled={loading}
                  rows={3}
                  style={{ flex: 1, resize: 'vertical', minHeight: '60px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !inputMessage.trim()}
                  className="btn btn-primary"
                  style={{ alignSelf: 'flex-end' }}
                >
                  <Send size={18} />
                  {loading ? '處理中...' : '發送'}
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                {selectedItemId ? (
                  <>
                    <button
                      onClick={handleUpdateWorkItem}
                      disabled={loading || !sessionId}
                      className="btn btn-success"
                      style={{ flex: 1 }}
                    >
                      <Save size={18} />
                      更新工作項目
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={loading}
                      className="btn btn-secondary"
                    >
                      <X size={18} />
                      取消
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleSaveAsNewWorkItem}
                    disabled={loading || !sessionId}
                    className="btn btn-success"
                    style={{ flex: 1 }}
                  >
                    <Sparkles size={18} />
                    儲存為新工作項目
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: AI Summary + Work Items List - 40% */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: 0 }}>


            {/* Work Items List */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '15px', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>
                    今日工作項目 ({filterWorkItems(workItems).length}{searchQuery && ` / ${workItems.length}`})
                  </h3>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                </div>
                {workItems.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#666' }} />
                    <input
                      type="text"
                      placeholder="搜尋標題、內容或 #ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        padding: '6px 12px 6px 32px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        width: '100%'
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
                )}
              </div>

              <div style={{ padding: '15px' }}>
                {workItems.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#666', padding: '30px 0' }}>
                    還沒有工作項目，開始與 AI 對話來建立吧！
                  </p>
                ) : filterWorkItems(workItems).length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#666', padding: '30px 0' }}>
                    找不到符合「{searchQuery}」的項目
                  </p>
                ) : (
                  sortItems(filterWorkItems(workItems)).map((item) => {
                    const isExpanded = expandedItems.has(item.id);

                    return (
                      <div
                        key={item.id}
                        style={{
                          marginBottom: '10px',
                          border: selectedItemId === item.id ? '2px solid #667eea' : '1px solid #e5e7eb',
                          borderRadius: '8px',
                          backgroundColor: selectedItemId === item.id ? '#f0f4ff' : '#fff',
                          transition: 'all 0.2s',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Header - Always Visible */}
                        <div
                          style={{
                            padding: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            backgroundColor: isExpanded ? '#f9fafb' : 'transparent',
                            gap: '8px'
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const newExpanded = new Set(expandedItems);
                            if (isExpanded) {
                              newExpanded.delete(item.id);
                            } else {
                              newExpanded.add(item.id);
                            }
                            setExpandedItems(newExpanded);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                            <div style={{ flexShrink: 0 }}>
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </div>
                            <h4
                              style={{
                                fontWeight: '600',
                                fontSize: '14px',
                                margin: 0,
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={item.ai_title || item.content}
                            >
                              #{item.id} {item.ai_title || item.content}
                            </h4>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <PriorityBadge priority={item.priority} />
                            <span style={{
                              fontSize: '11px',
                              whiteSpace: 'nowrap',
                              ...(() => {
                                if (!item.estimated_date) return { color: '#999' };
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const itemDate = new Date(item.estimated_date.split('T')[0]);
                                if (itemDate < today) {
                                  return { color: 'red', fontWeight: 'bold' };
                                }
                                return { color: '#0891b2' };
                              })()
                            }}>
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
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteWorkItem(item.id);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#dc2626',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0
                              }}
                              title="刪除"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #e5e7eb' }}>
                            {/* 預計處理時間 */}
                            <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                              <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>
                                <strong>預計處理時間：</strong>
                              </div>
                              <input
                                type="date"
                                className="input"
                                value={item.estimated_date ? (() => {
                                  const dateStr = item.estimated_date.includes('T') ? item.estimated_date.split('T')[0] : item.estimated_date;
                                  return dateStr;
                                })() : ''}
                                onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()}
                                onChange={async (e) => {
                                  try {
                                    // 確保日期格式正確（YYYY-MM-DD），不受時區影響
                                    const dateValue = e.target.value ? e.target.value : null;
                                    const token = localStorage.getItem('token');
                                    const response = await fetch(`/api/workitems/${item.id}`, {
                                      method: 'PATCH',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': token ? `Bearer ${token}` : ''
                                      },
                                      credentials: 'include',
                                      body: JSON.stringify({ estimated_date: dateValue })
                                    });
                                    if (!response.ok) {
                                      const error = await response.json();
                                      console.error('更新預計時間失敗:', error);
                                      alert(error.error || '更新失敗');
                                      return;
                                    }
                                    await loadWorkItems();
                                  } catch (error) {
                                    console.error('更新預計時間失敗:', error);
                                    alert('更新失敗，請稍後再試');
                                  }
                                }}
                                style={{ maxWidth: '200px' }}
                              />
                            </div>
                            {/* 處理人信息 */}
                            <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                              <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                                <strong>主要處理人：</strong>
                                {item.handlers?.primary ? (
                                  <span style={{ color: '#667eea', fontWeight: '500' }}>
                                    {item.handlers.primary.display_name || item.handlers.primary.username}
                                  </span>
                                ) : (
                                  <span>未指定</span>
                                )}
                              </div>

                              {item.handlers?.co_handlers && item.handlers.co_handlers.length > 0 && (
                                <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                                  <strong>共同處理人：</strong>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                    {item.handlers.co_handlers.map((handler) => (
                                      <span
                                        key={handler.user_id}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '4px 8px',
                                          background: '#e0e7ff',
                                          borderRadius: '12px',
                                          fontSize: '12px',
                                          color: '#4338ca'
                                        }}
                                      >
                                        {handler.display_name || handler.username}
                                        {item.handlers?.primary?.user_id === user.id && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRemoveCoHandler(item.id, handler.user_id);
                                            }}
                                            style={{
                                              background: 'none',
                                              border: 'none',
                                              color: '#dc2626',
                                              cursor: 'pointer',
                                              padding: '0',
                                              display: 'flex',
                                              alignItems: 'center',
                                              fontSize: '14px'
                                            }}
                                            title="移除"
                                          >
                                            ×
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 只有主要處理人可以添加共同處理人 */}
                              {item.handlers?.primary?.user_id === user.id && (
                                <div style={{ marginTop: '8px' }}>
                                  {showCoHandlerDialog === item.id ? (
                                    <div style={{
                                      padding: '8px',
                                      background: '#f9fafb',
                                      borderRadius: '6px',
                                      border: '1px solid #e5e7eb'
                                    }}>
                                      <div style={{ fontSize: '13px', marginBottom: '8px', fontWeight: '500' }}>
                                        選擇共同處理人：
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {teamMembers
                                          .filter(member =>
                                            member.user_id !== user.id &&
                                            !item.handlers?.co_handlers?.some(h => h.user_id === member.user_id)
                                          )
                                          .map(member => (
                                            <button
                                              key={member.user_id}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAddCoHandler(item.id, member.user_id);
                                              }}
                                              style={{
                                                padding: '6px 12px',
                                                background: '#fff',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                fontSize: '13px'
                                              }}
                                            >
                                              {member.display_name || member.username}
                                            </button>
                                          ))}
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowCoHandlerDialog(null);
                                        }}
                                        style={{
                                          marginTop: '8px',
                                          padding: '4px 8px',
                                          background: '#fff',
                                          border: '1px solid #d1d5db',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontSize: '12px',
                                          width: '100%'
                                        }}
                                      >
                                        取消
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCoHandlerDialog(item.id);
                                      }}
                                      style={{
                                        padding: '4px 8px',
                                        background: '#fff',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        color: '#667eea'
                                      }}
                                    >
                                      + 添加共同處理人
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {item.ai_summary && (
                              <div className="markdown-content workitems-markdown" style={{
                                fontSize: '13px',
                                color: '#666',
                                marginTop: '12px',
                                marginBottom: '12px',
                                overflowX: 'auto',
                                wordWrap: 'break-word',
                                wordBreak: 'break-word'
                              }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.ai_summary}</ReactMarkdown>
                              </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '12px', flexWrap: 'wrap' }}>
                              <div style={{ fontSize: '11px', color: '#999' }}>
                                建立於 {new Date(item.created_at).toLocaleString('zh-TW', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                              {item.handlers?.primary?.user_id === user.id && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveWorkItemToBacklog(item);
                                    }}
                                    className="btn btn-secondary"
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '13px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                  >
                                    <Undo2 size={14} />
                                    轉回 Backlog
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditWorkItem(item);
                                    }}
                                    className="btn btn-primary"
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '13px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                  >
                                    <Edit2 size={14} />
                                    編輯
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Incomplete Items List */}
            {incompleteItems.length > 0 && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '15px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fffbeb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      ⚠️ 未完成項目 ({incompleteItems.length})
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button
                        onClick={() => setSortBy(sortBy === 'priority' ? 'estimated_date' : 'priority')}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          borderRadius: '4px',
                          border: '1px solid #f59e0b',
                          backgroundColor: '#f59e0b',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                        title="點擊切換排序方式"
                      >
                        {sortBy === 'priority' ? '🔢 優先級' : '📅 預計時間'}
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
                        {showIncomplete ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#92400e', margin: '5px 0 0 0' }}>
                    這些是之前建立但尚未完成的項目，您可以繼續進行或標記為已完成/已取消
                  </p>
                </div>

                {showIncomplete && (
                  <div style={{ padding: '15px' }}>
                    {sortItems(incompleteItems).map((item: any) => {
                      const isExpanded = expandedItems.has(item.id);
                      const itemDate = item.checkin_date ? new Date(item.checkin_date).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) : '未知';
                      const ownerLabel = getWorkItemOwnerLabel(item);

                      return (
                        <div
                          key={item.id}
                          style={{
                            marginBottom: '10px',
                            border: '1px solid #fef3c7',
                            borderRadius: '8px',
                            backgroundColor: '#fefce8',
                            transition: 'all 0.2s',
                            overflow: 'hidden'
                          }}
                        >
                          {/* Header */}
                          <div
                            style={{
                              padding: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              backgroundColor: isExpanded ? '#fef3c7' : 'transparent'
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const newExpanded = new Set(expandedItems);
                              if (isExpanded) {
                                newExpanded.delete(item.id);
                              } else {
                                newExpanded.add(item.id);
                              }
                              setExpandedItems(newExpanded);
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                  <h4 style={{
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    margin: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: isExpanded ? 'normal' : 'nowrap',
                                    flex: 1
                                  }}>
                                    #{item.id} {item.ai_title || item.content.substring(0, 50) + '...'}
                                  </h4>
                                  <span style={{ fontSize: '12px', color: '#0369a1', whiteSpace: 'nowrap' }}>
                                    👤 {ownerLabel}
                                  </span>
                                  <PriorityBadge priority={item.priority} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
                                  <span style={{
                                    ...(() => {
                                      if (!item.estimated_date || ['completed', 'cancelled'].includes(item.progress_status || '')) return { color: '#999' };
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0);
                                      const itemDate = new Date(item.estimated_date.split('T')[0]);
                                      if (itemDate < today) {
                                        return { color: 'red', fontWeight: 'bold' };
                                      }
                                      return { color: '#0891b2' };
                                    })()
                                  }}>
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
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {isExpanded && (
                            <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #fef3c7' }}>
                              {/* 預計處理時間 */}
                              <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                                <div style={{ fontSize: '13px', color: '#92400e', marginBottom: '6px' }}>
                                  <strong>預計處理時間：</strong>
                                </div>
                                <input
                                  type="date"
                                  className="input"
                                  value={item.estimated_date ? (() => {
                                    const dateStr = item.estimated_date.includes('T') ? item.estimated_date.split('T')[0] : item.estimated_date;
                                    return dateStr;
                                  })() : ''}
                                  onClick={(e) => e.currentTarget.showPicker && e.currentTarget.showPicker()}
                                  onChange={async (e) => {
                                    try {
                                      // 確保日期格式正確（YYYY-MM-DD），不受時區影響
                                      const dateValue = e.target.value ? e.target.value : null;
                                      const token = localStorage.getItem('token');
                                      const response = await fetch(`/api/workitems/${item.id}`, {
                                        method: 'PATCH',
                                        headers: {
                                          'Content-Type': 'application/json',
                                          'Authorization': token ? `Bearer ${token}` : ''
                                        },
                                        credentials: 'include',
                                        body: JSON.stringify({ estimated_date: dateValue })
                                      });
                                      if (!response.ok) {
                                        const error = await response.json();
                                        console.error('更新預計時間失敗:', error);
                                        alert(error.error || '更新失敗');
                                        return;
                                      }
                                      // 未完成清單使用獨立狀態，更新後需重新載入以刷新畫面
                                      await loadIncompleteItems();
                                    } catch (error) {
                                      console.error('更新預計時間失敗:', error);
                                      alert('更新失敗，請稍後再試');
                                    }
                                  }}
                                  style={{ maxWidth: '200px' }}
                                />
                              </div>
                              {item.ai_summary && (
                                <div className="markdown-content workitems-markdown" style={{
                                  fontSize: '13px',
                                  color: '#92400e',
                                  marginTop: '12px',
                                  marginBottom: '12px',
                                  overflowX: 'auto',
                                  wordWrap: 'break-word',
                                  wordBreak: 'break-word'
                                }}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.ai_summary}</ReactMarkdown>
                                </div>
                              )}

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '11px', color: '#92400e' }}>
                                  建立於 {new Date(item.created_at).toLocaleString('zh-TW', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveWorkItemToBacklog(item);
                                    }}
                                    className="btn btn-secondary"
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '13px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                    disabled={loading}
                                  >
                                    <Undo2 size={14} />
                                    轉回 Backlog
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMoveIncompleteToToday(item);
                                    }}
                                    className="btn btn-warning"
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '13px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                    disabled={loading}
                                  >
                                    <Send size={14} />
                                    移動到今日
                                  </button>
                                </div>
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

            {/* Backlog Items List */}
            {backlogItems.length > 0 && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '15px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f0f9ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📋 Backlog 待辦項目 ({filterBacklogItems(backlogItems).length}{backlogSearchQuery && ` / ${backlogItems.length}`})
                    </h3>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <button
                        onClick={() => setSortBy(sortBy === 'priority' ? 'estimated_date' : 'priority')}
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          borderRadius: '4px',
                          border: '1px solid #0369a1',
                          backgroundColor: '#0369a1',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                        title="點擊切換排序方式"
                      >
                        {sortBy === 'priority' ? '🔢 優先級' : '📅 預計時間'}
                      </button>
                      <button
                        onClick={() => setShowBacklog(!showBacklog)}
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
                        {showBacklog ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>
                  {showBacklog && (
                    <div style={{ position: 'relative', marginBottom: '10px' }}>
                      <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#0369a1' }} />
                      <input
                        type="text"
                        placeholder="搜尋 Backlog 項目或 #ID..."
                        value={backlogSearchQuery}
                        onChange={(e) => setBacklogSearchQuery(e.target.value)}
                        style={{
                          padding: '6px 12px 6px 32px',
                          fontSize: '13px',
                          borderRadius: '4px',
                          border: '1px solid #bae6fd',
                          width: '100%',
                          backgroundColor: '#fff'
                        }}
                      />
                      {backlogSearchQuery && (
                        <button
                          onClick={() => setBacklogSearchQuery('')}
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
                  )}
                  <p style={{ fontSize: '12px', color: '#0369a1', margin: '5px 0 0 0' }}>
                    這些是提前規劃的工作項目，點擊「加入今日」會使用 AI 協助您進一步完善工作內容
                  </p>
                </div>

                {showBacklog && (
                  <div style={{ padding: '15px' }}>
                    {filterBacklogItems(backlogItems).length === 0 ? (
                      <p style={{ textAlign: 'center', color: '#0369a1', padding: '20px 0' }}>
                        找不到符合「{backlogSearchQuery}」的項目
                      </p>
                    ) : (
                      sortItems(filterBacklogItems(backlogItems)).map((item: any) => {
                        const isExpanded = expandedItems.has(item.id);
                        const estimatedDate = item.estimated_date
                          ? (() => {
                            const dateStr = typeof item.estimated_date === 'string' && item.estimated_date.includes('T')
                              ? item.estimated_date.split('T')[0]
                              : item.estimated_date;
                            const [year, month, day] = dateStr.split('-');
                            return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
                          })()
                          : '未設定';
                        const ownerLabel = getBacklogOwnerLabel(item);

                        return (
                          <div
                            key={item.id}
                            style={{
                              marginBottom: '10px',
                              border: '1px solid #bae6fd',
                              borderRadius: '8px',
                              backgroundColor: '#e0f2fe',
                              transition: 'all 0.2s',
                              overflow: 'hidden'
                            }}
                          >
                            {/* Header */}
                            <div
                              style={{
                                padding: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                backgroundColor: isExpanded ? '#bae6fd' : 'transparent'
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newExpanded = new Set(expandedItems);
                                if (isExpanded) {
                                  newExpanded.delete(item.id);
                                } else {
                                  newExpanded.add(item.id);
                                }
                                setExpandedItems(newExpanded);
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <h4 style={{
                                      fontWeight: '600',
                                      fontSize: '14px',
                                      margin: 0,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: isExpanded ? 'normal' : 'nowrap',
                                      flex: 1
                                    }}>
                                      #{item.id} {item.ai_title || item.content}
                                    </h4>
                                    <PriorityBadge priority={item.priority} />
                                  </div>
                                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '11px', color: '#0369a1' }}>
                                    <span style={{ whiteSpace: 'nowrap' }}>👤 {ownerLabel}</span>
                                    <span style={{
                                      whiteSpace: 'nowrap',
                                      ...(() => {
                                        if (!item.estimated_date) return { color: '#999' };
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        const itemDate = new Date(item.estimated_date.split('T')[0]);
                                        if (itemDate < today) {
                                          return { color: 'red', fontWeight: 'bold' };
                                        }
                                        return { color: '#0891b2' };
                                      })()
                                    }}>
                                      📅 {estimatedDate}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Expanded Content */}
                            {isExpanded && (
                              <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #bae6fd' }}>
                                {item.content && (
                                  <div className="markdown-content workitems-markdown" style={{
                                    fontSize: '13px',
                                    color: '#0369a1',
                                    marginTop: '12px',
                                    marginBottom: '12px',
                                    overflowX: 'auto',
                                    wordWrap: 'break-word',
                                    wordBreak: 'break-word'
                                  }}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                                  </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                                  <div style={{ fontSize: '11px', color: '#0369a1' }}>
                                    建立於 {new Date(item.created_at).toLocaleString('zh-TW', {
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddBacklogToToday(item);
                                    }}
                                    className="btn btn-primary"
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '13px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px'
                                    }}
                                    disabled={loading}
                                    title="加入今日工作項目"
                                  >
                                    <Send size={14} />
                                    加入今日 (AI 對談)
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: '20px', background: '#f9fafb' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#374151' }}>💡 工作項目小提示</h3>
          <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#6b7280' }}>
            <li><strong style={{ color: '#0f172a' }}>打卡後建議立刻填寫工作項目</strong>，可從 Backlog 快速加入或與 AI 對話生成，AI 會根據內容自動產生摘要與標題。</li>
            <li>優先級建議：<strong style={{ color: '#b91c1c' }}>1–2 給當日必做</strong>項目，<strong style={{ color: '#2563eb' }}>預計處理時間</strong>可在卡片展開後直接點日期選擇器設定。</li>
            <li>需要協作請點開卡片找到<strong style={{ color: '#047857' }}>「+ 添加共同處理人」</strong>，共同處理人可更新進度但無法標記完成（需主要處理人確認）。</li>
            <li><strong style={{ color: '#0f172a' }}>AI 摘要僅供參考</strong>，實際執行細節請在對話中或卡片內容補充清楚，避免團隊成員理解錯誤。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default WorkItems;
