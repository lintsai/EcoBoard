import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Sparkles, RefreshCw, FileText, Loader2, History, Save, X } from 'lucide-react';
import api from '../services/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface DailySummaryData {
  summary: string;
  date: string;
  teamId: number;
  cached?: boolean;
  createdAt?: string;
}

interface HistoryItem {
  id: number;
  team_id: number;
  summary_date: string;
  summary_content: string;
  created_at: string;
  generated_by_name?: string;
}

function DailySummary({ user, teamId }: any) {
  const navigate = useNavigate();
  
  // 獲取當地時區的今日日期（避免 UTC 時區問題）
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [summary, setSummary] = useState<DailySummaryData | null>(null);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null); // 預覽的總結內容
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [enlargedTable, setEnlargedTable] = useState<string | null>(null);

  useEffect(() => {
    if (teamId) {
      fetchDailySummary();
    }
  }, [teamId]);

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

  const fetchDailySummary = async (date?: string) => {
    setLoading(true);
    setError('');
    
    try {
      const summaryDate = date || selectedDate;
      const data = await api.generateDailySummary(teamId, summaryDate);
      setSummary(data);
    } catch (err: any) {
      setError(err.response?.data?.error || '載入每日總結失敗');
      console.error('載入總結失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await api.getDailySummaryHistory(teamId, 30);
      setHistory(response);
    } catch (err: any) {
      console.error('載入歷史總結失敗:', err);
      setError('載入歷史總結失敗');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleGenerateSummary = async () => {
    setGenerating(true);
    setError('');
    setPreviewSummary(null); // 清除舊的預覽
    
    try {
      const summaryDate = selectedDate;
      // 強制重新生成（不使用快取）
      const data = await api.generateDailySummary(teamId, summaryDate, true);
      
      // 總是設定為預覽模式，讓使用者決定是否儲存
      setPreviewSummary(data.summary);
    } catch (err: any) {
      setError(err.response?.data?.error || '生成總結失敗');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!previewSummary) return;
    
    setSaving(true);
    setError('');
    
    try {
      // 呼叫 API 儲存總結
      const response = await api.saveDailySummary(teamId, selectedDate, previewSummary);
      
      // 儲存成功後，設定為正式的 summary
      setSummary({
        summary: previewSummary,
        date: selectedDate,
        teamId: teamId,
        cached: true,
        createdAt: new Date().toISOString()
      });
      
      setPreviewSummary(null);
      
      // 重新載入歷史記錄
      if (showHistory) {
        fetchHistory();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || '儲存總結失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelPreview = () => {
    setPreviewSummary(null);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    
    // 只有當日期真正改變時才處理
    if (newDate && newDate !== selectedDate) {
      setSelectedDate(newDate);
      // 清除預覽狀態
      setPreviewSummary(null);
      // 清除當前顯示的總結
      setSummary(null);
      // 自動載入新日期的總結
      fetchDailySummary(newDate);
    } else if (newDate) {
      // 日期沒變，只更新 state（讓日曆可以正常彈出）
      setSelectedDate(newDate);
    }
  };

  const handleRefresh = () => {
    // 清除預覽狀態
    setPreviewSummary(null);
    fetchDailySummary(selectedDate);
  };

  const handleShowHistory = () => {
    setShowHistory(!showHistory);
    if (!showHistory && history.length === 0) {
      fetchHistory();
    }
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    // 清除預覽狀態
    setPreviewSummary(null);
    // 設定選擇的日期（確保格式正確）
    const formattedDate = item.summary_date.split('T')[0]; // 確保只取日期部分
    setSelectedDate(formattedDate);
    setSummary({
      summary: item.summary_content,
      date: formattedDate,
      teamId: item.team_id,
      cached: true,
      createdAt: item.created_at
    });
    setShowHistory(false);
  };

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

        <div className="header">
          <div>
            <h1 style={{ marginBottom: '8px' }}>每日總結</h1>
            <p style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} />
              AI 自動分析團隊當日工作進展並生成總結報告
            </p>
          </div>
        </div>

        {/* 日期選擇和操作按鈕 */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 auto', position: 'relative' }}>
              <label htmlFor="summary-date" style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500 }}>
                選擇日期
              </label>
              <input
                type="date"
                id="summary-date"
                value={selectedDate}
                onChange={handleDateChange}
                max={getTodayDate()}
                disabled={generating || saving}
                style={{ 
                  width: '200px',
                  padding: '10px 12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  cursor: 'pointer'
                }}
              />
            </div>

            <div style={{ flex: '0 0 auto', marginTop: '24px' }}>
              <button
                className="btn btn-primary"
                onClick={handleGenerateSummary}
                disabled={generating || loading || saving}
                style={{ marginRight: '10px' }}
              >
                {generating ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    {previewSummary ? '重新生成' : '生成總結'}
                  </>
                )}
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleRefresh}
                disabled={loading || generating || saving || !!previewSummary}
                style={{ marginRight: '10px' }}
              >
                <RefreshCw size={18} />
                重新載入
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleShowHistory}
                disabled={loading || generating || saving || !!previewSummary}
              >
                <History size={18} />
                {showHistory ? '隱藏歷史' : '查看歷史'}
              </button>
            </div>
          </div>
        </div>

        {/* 歷史記錄列表 */}
        {showHistory && (
          <div className="card" style={{ marginBottom: '20px', maxHeight: '400px', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1f2937' }}>
              <History size={20} />
              歷史總結記錄
            </h3>
            
            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <Loader2 size={32} className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : history.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '20px' }}>暫無歷史記錄</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {history.map((item) => {
                  const itemDate = item.summary_date.split('T')[0]; // 確保格式一致
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectHistoryItem(item)}
                      style={{
                        padding: '12px 15px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        backgroundColor: selectedDate === itemDate ? '#f0f8ff' : '#fff',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedDate !== itemDate) {
                          e.currentTarget.style.backgroundColor = '#f9fafb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedDate !== itemDate) {
                          e.currentTarget.style.backgroundColor = '#fff';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Calendar size={16} style={{ color: '#667eea' }} />
                          <span style={{ fontWeight: 500, fontSize: '15px', color: '#1f2937' }}>
                            {new Date(item.summary_date).toLocaleDateString('zh-TW', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              weekday: 'short'
                            })}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {item.generated_by_name && `由 ${item.generated_by_name} 生成`}
                          {' · '}
                          {new Date(item.created_at).toLocaleDateString('zh-TW')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <FileText size={18} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Loader2 size={48} className="spinner" style={{ margin: '0 auto 20px' }} />
            <p style={{ color: '#666', fontSize: '16px' }}>正在載入總結...</p>
          </div>
        ) : previewSummary ? (
          // 預覽模式：顯示生成的內容和儲存/取消按鈕
          <div className="card" style={{ border: '2px solid #ffa500' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              paddingBottom: '15px',
              borderBottom: '2px solid #ffa500',
              marginBottom: '20px',
              backgroundColor: '#fff8e6',
              margin: '-20px -20px 20px -20px',
              padding: '15px 20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Sparkles size={20} style={{ color: '#ffa500' }} />
                <h2 style={{ margin: 0, fontSize: '18px', color: '#ff8c00' }}>
                  預覽：AI 生成的總結（尚未儲存）
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-success"
                  onClick={handleSaveSummary}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      儲存中...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      儲存總結
                    </>
                  )}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleCancelPreview}
                  disabled={saving}
                >
                  <X size={16} />
                  取消
                </button>
              </div>
            </div>

            <div 
              className="markdown-content prose-sm"
              style={{
                fontSize: '15px',
                lineHeight: '1.8',
                color: '#333'
              }}
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {previewSummary}
              </ReactMarkdown>
            </div>
          </div>
        ) : summary ? (
          <div className="card">
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              paddingBottom: '15px',
              borderBottom: '2px solid #e5e7eb',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={20} style={{ color: '#667eea' }} />
                <h2 style={{ margin: 0, fontSize: '20px', color: '#1f2937' }}>
                  {new Date(summary.date).toLocaleDateString('zh-TW', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                  })}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {summary.cached && (
                  <span className="badge" style={{ backgroundColor: '#28a745' }}>
                    已儲存
                  </span>
                )}
                <span className="badge badge-primary">
                  <Sparkles size={14} />
                  AI 生成
                </span>
              </div>
            </div>

            <div 
              className="markdown-content prose-sm"
              style={{
                fontSize: '15px',
                lineHeight: '1.8',
                color: '#333'
              }}
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {summary.summary}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <FileText size={48} style={{ color: '#d1d5db', margin: '0 auto 20px' }} />
            <p style={{ color: '#6b7280', fontSize: '16px', marginBottom: '20px' }}>
              尚未生成總結，請選擇日期並點擊「生成總結」按鈕
            </p>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>
              AI 將分析該日期的工作項目、打卡記錄和進度更新，<br />
              自動生成詳細的工作總結報告
            </p>
          </div>
        )}

        {/* 使用說明 */}
        <div className="card" style={{ marginTop: '20px', backgroundColor: '#f9fafb' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#374151' }}>💡 總結報告包含內容</h3>
          <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#6b7280' }}>
            <li>總結會拉入<strong style={{ color: '#0f172a' }}>當日打卡、工作項目與進度更新</strong>，資料不足時先回原頁補齊。</li>
            <li>AI 會整理<strong style={{ color: '#2563eb' }}>完成/未完成清單、阻塞與明日建議</strong>，可直接準備隔日站會。</li>
            <li>報告支援 Markdown，若要複製到外部工具可<strong style={{ color: '#047857' }}>直接選取貼上</strong>。</li>
            <li>若換時區或補登內容，重新點<strong style={{ color: '#2563eb' }}>「生成總結」</strong>即可更新最新版本。</li>
          </ul>
        </div>
      </div>


    </div>
  );
}

export default DailySummary;
