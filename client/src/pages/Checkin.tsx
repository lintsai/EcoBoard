import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, ArrowLeft, FileText, Lightbulb, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';

interface CheckinProps {
  user: any;
  teamId: number;
  onLogout: () => void;
}

function Checkin({ user, teamId, onLogout }: CheckinProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [checkinTime, setCheckinTime] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [suggestionLoading, setSuggestionLoading] = useState(true);
  const [suggestionError, setSuggestionError] = useState('');
  const [todaySuggestion, setTodaySuggestion] = useState('');
  const [taskIndexSection, setTaskIndexSection] = useState('');
  const [suggestionSourceDate, setSuggestionSourceDate] = useState('');
  const [enlargedTable, setEnlargedTable] = useState<string | null>(null);
  const suggestionCardRef = useRef<HTMLDivElement | null>(null);

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getYesterdayDate = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - 1);
    return formatDate(date);
  };

  const extractSectionByKeyword = (content: string, keyword: string) => {
    if (!content) return '';

    const lines = content.split('\n');
    const lowerKeyword = keyword.toLowerCase();
    let startIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerKeyword)) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) return '';

    const collected: string[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (i !== startIndex) {
        const isNewHeading = /^#{1,6}\s+/.test(line) || (/^\d+\.\s+\*\*[^*]+\*\*/.test(line) && !line.toLowerCase().includes(lowerKeyword));
        if (isNewHeading || line.includes('任務索引')) {
          break;
        }
      }
      collected.push(line);
    }

    return collected.join('\n').trim();
  };

  const stripKeywordHeading = (section: string, keyword: string) => {
    if (!section) return '';
    const lowerKeyword = keyword.toLowerCase();
    const lines = section.split('\n');
    const filtered = lines.filter((line, index) => {
      if (index === 0 && line.toLowerCase().includes(lowerKeyword)) return false;
      if (/^#{1,6}\s+/.test(line) && line.toLowerCase().includes(lowerKeyword)) return false;
      return true;
    });
    return filtered.join('\n').trim();
  };

  const extractTaskIndexSection = (content: string) => {
    if (!content) return '';
    const headingMatch = content.match(/(?:^|\n)(#{2,6}\s*任務索引[^\n]*\n[\s\S]*)/);
    if (headingMatch) return headingMatch[1].trim();

    const boldMatch = content.match(/(?:^|\n)\*\*?任務索引\*?\*[^\n]*\n([\s\S]*)/);
    if (boldMatch) return `### 任務索引\n${boldMatch[1].trim()}`;

    return '';
  };

  useEffect(() => {
    checkTodayCheckin();
  }, [teamId]);

  useEffect(() => {
    if (teamId) {
      fetchYesterdaySuggestion();
    }
  }, [teamId]);

  useEffect(() => {
    const handleTableClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const table = target.closest('.markdown-content table');
      if (table && suggestionCardRef.current?.contains(table) && !target.closest('.table-modal-content')) {
        e.preventDefault();
        e.stopPropagation();
        setEnlargedTable((table as HTMLElement).outerHTML);
      }
    };

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

  const checkTodayCheckin = async () => {
    try {
      setCheckingStatus(true);
      const checkin = await api.getTodayUserCheckin(teamId);
      if (checkin) {
        setAlreadyCheckedIn(true);
        setCheckinTime(checkin.checkin_time);
      }
    } catch (err) {
      console.error('Error checking today checkin:', err);
    } finally {
      setCheckingStatus(false);
    }
  };

  const fetchYesterdaySuggestion = async () => {
    if (!teamId) {
      setSuggestionLoading(false);
      return;
    }

    setSuggestionLoading(true);
    setSuggestionError('');
    setTodaySuggestion('');
    setTaskIndexSection('');

    try {
      const yesterday = getYesterdayDate();
      setSuggestionSourceDate(yesterday);

      const data = await api.getDailySummaryByDate(teamId, yesterday);
      const summaryContent = data.summary_content || data.summary || '';
      const suggestionSection = stripKeywordHeading(
        extractSectionByKeyword(summaryContent, '明日建議'),
        '明日建議'
      );
      const indexSection = extractTaskIndexSection(summaryContent);

      setTodaySuggestion(suggestionSection);
      setTaskIndexSection(indexSection);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setSuggestionError('');
      } else {
        console.error('Error loading yesterday suggestion:', err);
        setSuggestionError(err.response?.data?.error || '無法取得昨日的建議');
      }
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleCheckin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.checkin(teamId);
      setSuccess(true);
      setAlreadyCheckedIn(true);
      setCheckinTime(result.checkin_time);
      setTimeout(() => {
        navigate('/workitems');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || '打卡失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkItem = () => {
    navigate('/workitems');
  };

  if (checkingStatus) {
    return (
      <div className="app-container">
        <div className="main-content">
          <Breadcrumbs />
          <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <span className="loading" style={{ margin: '0 auto' }}></span>
            <p style={{ marginTop: '20px', color: '#6b7280' }}>載入中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="main-content">
        <Breadcrumbs />
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: '20px' }}>
          <ArrowLeft size={18} />
          返回儀表板
        </button>

        <div className="header">
          <h1>早上打卡</h1>
        </div>

        {success ? (
          <div className="alert alert-success">
            ✓ 打卡成功！即將跳轉到填寫工作項目頁面...
          </div>
        ) : alreadyCheckedIn ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <CheckSquare size={64} style={{ color: '#10b981', margin: '0 auto 24px' }} />
            <h2 style={{ marginBottom: '12px' }}>今日已打卡</h2>
            <p style={{ color: '#6b7280', marginBottom: '32px' }}>
              打卡時間：{new Date(checkinTime).toLocaleString('zh-TW')}
            </p>

            <button
              className="btn btn-primary"
              onClick={handleCreateWorkItem}
              style={{ padding: '16px 48px', fontSize: '16px' }}
            >
              <FileText size={20} style={{ marginRight: '8px' }} />
              建立工作項目
            </button>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <CheckSquare size={64} style={{ color: '#10b981', margin: '0 auto 24px' }} />
            <h2 style={{ marginBottom: '12px' }}>準備開始新的一天</h2>
            <p style={{ color: '#6b7280', marginBottom: '32px' }}>
              點擊下方按鈕進行打卡
            </p>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: '20px' }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleCheckin}
              disabled={loading}
              style={{ padding: '16px 48px', fontSize: '16px' }}
            >
              {loading ? <span className="loading"></span> : '立即打卡'}
            </button>

            <p style={{ marginTop: '24px', color: '#9ca3af', fontSize: '14px' }}>
              當前時間：{new Date().toLocaleString('zh-TW')}
            </p>
          </div>
        )}

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

        <div className="card" ref={suggestionCardRef} style={{ marginTop: '20px', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Lightbulb size={20} style={{ color: '#f59e0b' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>今日建議（來源：昨日總結）</h3>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '13px' }}>
                  {suggestionSourceDate ? `來源日期：${suggestionSourceDate}` : '來源日期：昨日總結'}
                </p>
              </div>
            </div>
          </div>

          {suggestionLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280' }}>
              <Loader2 size={18} className="spinner" />
              <span>載入昨日的建議...</span>
            </div>
          ) : suggestionError ? (
            <div className="alert alert-error">
              {suggestionError}
            </div>
          ) : todaySuggestion ? (
            <div className="markdown-content prose-sm" style={{ fontSize: '14px', lineHeight: '1.7', color: '#374151' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {todaySuggestion}
              </ReactMarkdown>
            </div>
          ) : (
            <p style={{ color: '#6b7280', margin: 0 }}>昨日尚未有建議，暫無今日建議可供參考。</p>
          )}

          {taskIndexSection && (
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
              {!taskIndexSection.includes('任務索引') && (
                <p style={{ margin: '0 0 8px 0', color: '#4b5563', fontSize: '13px', fontWeight: 600 }}>任務索引（對照上述提及的 ID）</p>
              )}
              <div className="markdown-content prose-sm" style={{ fontSize: '13px', color: '#374151' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {taskIndexSection}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {!taskIndexSection && todaySuggestion && !suggestionLoading && !suggestionError && (
            <p style={{ marginTop: '12px', color: '#9ca3af', fontSize: '13px' }}>
              未找到任務索引對照表，若需 ID 對應請重新生成昨日的每日總結。
            </p>
          )}
        </div>

        <div className="card" style={{ marginTop: '20px', background: '#f9fafb' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#374151' }}>💡 打卡小提示</h3>
          <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#6b7280' }}>
            <li><strong style={{ color: '#0f172a' }}>每日首次打卡</strong>會記錄到勤時間，完成後<strong style={{ color: '#2563eb' }}>自動跳轉到工作項目填寫頁</strong>，方便立即規劃今日任務。</li>
            <li>打卡後可直接從 Backlog 選擇項目，<strong style={{ color: '#047857' }}>AI 會協助生成今日工作內容</strong>，無需重新輸入。</li>
            <li>若當日已打卡，此頁會顯示打卡時間並提供<strong style={{ color: '#2563eb' }}>「建立工作項目」</strong>快捷按鈕。</li>
            <li>忘記打卡可隨時補登，但請<strong style={{ color: '#b91c1c' }}>同步確認工作項目已填寫</strong>，避免影響站立會議與日報。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Checkin;
