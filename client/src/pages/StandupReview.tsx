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
  session_id?: string;
  ai_summary?: string;
  ai_title?: string;
}

function StandupReview({ user, teamId }: any) {
  const navigate = useNavigate();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [error, setError] = useState('');
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set());
  const [showAllWorkItems, setShowAllWorkItems] = useState(true);
  const [assigningItem, setAssigningItem] = useState<number | null>(null);
  const [expandedWorkItems, setExpandedWorkItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (teamId) {
      loadStandupData();
    }
  }, [teamId]);

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
      const [membersData, checkinsData, workItemsData] = await Promise.all([
        api.getTeamMembers(teamId),
        api.getTodayTeamCheckins(teamId),
        api.getTodayTeamWorkItems(teamId)
      ]);

      console.log('=== Standup Review Debug ===');
      console.log('Team members:', membersData);
      console.log('Today checkins:', checkinsData);
      console.log('Work items:', workItemsData);
      console.log('Today date (client):', new Date().toISOString().split('T')[0]);
      
      // 檢查數據匹配
      membersData.forEach((member: any) => {
        const hasCheckin = checkinsData.find((c: any) => c.user_id === member.user_id);
        const workItemCount = workItemsData.filter((item: any) => item.user_id === member.user_id).length;
        console.log(`${member.display_name || member.username} (ID: ${member.user_id}):`, {
          hasCheckin: !!hasCheckin,
          checkinTime: hasCheckin?.checkin_time,
          workItems: workItemCount
        });
      });
      console.log('===========================');

      setTeamMembers(membersData);
      setCheckins(checkinsData);
      setWorkItems(workItemsData);
    } catch (err: any) {
      setError(err.message || '載入站立會議資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeWorkItems = async () => {
    if (workItems.length === 0) {
      setError('目前沒有工作項目可以分析');
      return;
    }

    setAnalyzing(true);
    setError('');
    
    try {
      const result = await api.analyzeWorkItems(teamId, workItems);
      
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
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit'
    });
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
              <div className="stat-label">工作項目</div>
              <div className="stat-value">{workItems.length}</div>
            </div>
          </div>
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
                          <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>
                            {suggestion.task}
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            從 <strong>{suggestion.from}</strong> 分配給 <strong>{suggestion.to}</strong>
                          </div>
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

        {/* 所有工作項目總覽 */}
        {workItems.length > 0 && (
          <div className="card" style={{ marginBottom: '20px' }}>
            <div 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                cursor: 'pointer',
                padding: '15px',
                borderBottom: showAllWorkItems ? '1px solid #e0e0e0' : 'none'
              }}
              onClick={toggleAllWorkItems}
            >
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={20} />
                所有工作項目總覽 ({workItems.length})
              </h3>
              {showAllWorkItems ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
            
            {showAllWorkItems && (
              <div style={{ padding: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                  {[...workItems]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((item) => {
                    const isItemExpanded = expandedWorkItems.has(item.id);
                    
                    return (
                      <div 
                        key={item.id}
                        className="card"
                        style={{ 
                          padding: '0',
                          borderLeft: '3px solid #667eea',
                          backgroundColor: '#f8f9fa',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Header - Always Visible */}
                        <div
                          style={{
                            padding: '12px',
                            display: 'flex',
                            alignItems: 'start',
                            gap: '8px',
                            cursor: 'pointer',
                            backgroundColor: isItemExpanded ? '#fff' : 'transparent'
                          }}
                          onClick={() => {
                            const newExpanded = new Set(expandedWorkItems);
                            if (isItemExpanded) {
                              newExpanded.delete(item.id);
                            } else {
                              newExpanded.add(item.id);
                            }
                            setExpandedWorkItems(newExpanded);
                          }}
                        >
                          <div style={{ paddingTop: '2px' }}>
                            {isItemExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '8px' }}>
                              {item.ai_title || item.content}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#999', marginBottom: '6px' }}>
                              <span>
                                👤 <strong style={{ color: '#667eea' }}>{item.display_name || item.username}</strong>
                              </span>
                              <span>{formatTime(item.created_at).split(' ')[1]}</span>
                            </div>
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                            {assigningItem === item.id ? (
                              <select 
                                className="input"
                                style={{ fontSize: '12px', padding: '4px', width: 'auto' }}
                                onChange={(e) => handleAssignWorkItem(item.id, parseInt(e.target.value))}
                                onBlur={() => setAssigningItem(null)}
                                autoFocus
                              >
                                <option value="">選擇成員</option>
                                {teamMembers.map(member => (
                                  <option key={member.user_id} value={member.user_id}>
                                    {member.display_name || member.username}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <button
                                className="btn btn-secondary"
                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                onClick={() => setAssigningItem(item.id)}
                                title="重新分配"
                              >
                                <UserPlus size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Expanded Content */}
                        {isItemExpanded && item.ai_summary && (
                          <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid #e5e7eb' }}>
                            <div style={{
                              padding: '8px',
                              backgroundColor: '#fff',
                              borderRadius: '4px',
                              marginTop: '8px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                <Sparkles size={12} style={{ color: '#667eea', marginRight: '4px' }} />
                                <span style={{ fontSize: '11px', fontWeight: '600', color: '#667eea' }}>AI 摘要</span>
                              </div>
                              <div className="markdown-content" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.ai_summary}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}
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
                                  style={{ 
                                    marginBottom: '8px',
                                    backgroundColor: '#fff',
                                    borderRadius: '6px',
                                    borderLeft: '3px solid #7c3aed',
                                    overflow: 'hidden'
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
                                    onClick={() => {
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
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#999' }}>
                                      {formatTime(item.created_at).split(' ')[1]}
                                    </div>
                                  </div>
                                  
                                  {/* Expanded Content */}
                                  {isItemExpanded && item.ai_summary && (
                                    <div style={{ padding: '0 10px 10px 10px', borderTop: '1px solid #e5e7eb' }}>
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
                          尚未分配工作項目
                        </div>
                      )}
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
      </div>
    </div>
  );
}

export default StandupReview;
