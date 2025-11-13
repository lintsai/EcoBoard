import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ArrowLeft, Send, Trash2, Edit2, Sparkles, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';

interface WorkItemsProps {
  user: any;
  teamId: number;
  onLogout: () => void;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

interface WorkItem {
  id: number;
  content: string;
  item_type: string;
  created_at: string;
  session_id?: string;
  ai_summary?: string;
  ai_title?: string;
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
  const [currentItemAiSummary, setCurrentItemAiSummary] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [showIncomplete, setShowIncomplete] = useState(true);
  const [enlargedTable, setEnlargedTable] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadTodayCheckin();
    loadWorkItems();
    loadIncompleteItems();
    setMessages([{
      role: 'ai',
      content: '您好！我會協助您規劃今日的工作項目。請告訴我您今天計劃完成哪些工作？',
      timestamp: new Date().toISOString()
    }]);
  }, []);

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
      setWorkItems(items);
    } catch (error) {
      console.error('Failed to load work items:', error);
    }
  };

  const loadIncompleteItems = async () => {
    try {
      const items = await api.getIncompleteWorkItems(teamId);
      // Backend now filters out today's items automatically
      setIncompleteItems(items);
    } catch (error) {
      console.error('Failed to load incomplete items:', error);
    }
  };

  const loadChatHistory = async (itemSessionId: string) => {
    try {
      const history = await api.getChatHistory(itemSessionId);
      const formattedMessages: ChatMessage[] = [];
      
      history.forEach((msg: any) => {
        formattedMessages.push({
          role: 'user',
          content: msg.content,
          timestamp: msg.created_at
        });
        if (msg.ai_response) {
          formattedMessages.push({
            role: 'ai',
            content: msg.ai_response,
            timestamp: msg.created_at
          });
        }
      });

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Failed to load chat history:', error);
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
          content: '您好！我會協助您規劃今日的工作項目。請告訴我您今天計劃完成哪些工作？',
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || '刪除失敗');
    }
  };

  const handleEditWorkItem = async (item: WorkItem) => {
    setSelectedItemId(item.id);
    setCurrentItemAiSummary(item.ai_summary || '');
    
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
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const handleSend = async () => {
    if (!inputMessage.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toISOString()
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
        timestamp: response.timestamp
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'ai',
        content: '抱歉，發生錯誤。請稍後再試。',
        timestamp: new Date().toISOString()
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
        titleText
      );

      alert('工作項目已儲存！');
      
      await loadWorkItems();
      setSessionId('');
      setSelectedItemId(null);
      setCurrentItemAiSummary('');
      setMessages([{
        role: 'ai',
        content: '✅ 工作項目已成功儲存！\n\n您可以繼續新增其他工作項目。',
        timestamp: new Date().toISOString()
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
        aiTitle: summary.title
      });

      // Reload work items list
      await loadWorkItems();
      
      // Clear edit mode states
      setSessionId('');
      setSelectedItemId(null);
      
      // Keep the summary visible so user can see what was saved
      setCurrentItemAiSummary(summary.summary);
      
      setMessages([{
        role: 'ai',
        content: '✅ 工作項目已更新！\n\n您可以繼續新增或編輯其他工作項目。',
        timestamp: new Date().toISOString()
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
    setMessages([{
      role: 'ai',
      content: '已取消編輯。您可以新增其他工作項目或編輯現有項目。',
      timestamp: new Date().toISOString()
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
              <MessageSquare size={28} />
              AI 工作項目規劃
            </h1>
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>
            {user.display_name || user.username}
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
        <div style={{ display: 'grid', gridTemplateColumns: '60% 38%', gap: '20px', minHeight: 'calc(100vh - 250px)', alignItems: 'start' }}>
          {/* Left: Chat Dialog - 60% */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 250px)', position: 'sticky', top: '20px' }}>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
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
                      {new Date(msg.timestamp).toLocaleTimeString('zh-TW')}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div style={{ padding: '15px', borderTop: '1px solid #e5e7eb' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>


            {/* Work Items List */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '15px', borderBottom: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: 0 }}>
                  今日工作項目 ({workItems.length})
                </h3>
              </div>
              
              <div style={{ padding: '15px' }}>
                {workItems.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#666', padding: '30px 0' }}>
                    還沒有工作項目，開始與 AI 對話來建立吧！
                  </p>
                ) : (
                  workItems.map((item) => {
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
                          onClick={() => {
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
                              {item.ai_title || item.content}
                            </h4>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <span style={{ fontSize: '12px', color: '#999', whiteSpace: 'nowrap' }}>
                              {new Date(item.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
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
                            {item.ai_summary && (
                              <div className="markdown-content" style={{ 
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
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                              <div style={{ fontSize: '11px', color: '#999' }}>
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
                  <p style={{ fontSize: '12px', color: '#92400e', margin: '5px 0 0 0' }}>
                    這些是之前建立但尚未完成的項目，您可以繼續進行或標記為已完成/已取消
                  </p>
                </div>
                
                {showIncomplete && (
                  <div style={{ padding: '15px' }}>
                    {incompleteItems.map((item: any) => {
                      const isExpanded = expandedItems.has(item.id);
                      const itemDate = item.checkin_date ? new Date(item.checkin_date).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' }) : '未知';
                      
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
                            onClick={() => {
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
                                <h4 style={{ 
                                  fontWeight: '600', 
                                  fontSize: '14px', 
                                  margin: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: isExpanded ? 'normal' : 'nowrap'
                                }}>
                                  {item.ai_title || item.content.substring(0, 50) + '...'}
                                </h4>
                                <span style={{ fontSize: '11px', color: '#92400e' }}>
                                  📅 建立於 {itemDate}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Expanded Content */}
                          {isExpanded && (
                            <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #fef3c7' }}>
                              {item.ai_summary && (
                                <div className="markdown-content" style={{ 
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
                              
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                                <div style={{ fontSize: '11px', color: '#92400e' }}>
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorkItems;
