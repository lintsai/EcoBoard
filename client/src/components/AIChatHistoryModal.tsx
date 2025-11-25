import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, MessageSquare } from 'lucide-react';
import api from '../services/api';

interface AIChatHistoryModalProps {
  sessionId?: string | null;
  open: boolean;
  onClose: () => void;
  title?: string;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  author?: string;
}

const AIChatHistoryModal = ({ sessionId, open, onClose, title }: AIChatHistoryModalProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emptyMessage, setEmptyMessage] = useState('');

  const headerTitle = useMemo(() => {
    if (title) return title;
    return sessionId ? 'AI 對談紀錄' : '未綁定 AI 對談';
  }, [sessionId, title]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!open) {
        return;
      }
      if (!sessionId) {
        setMessages([]);
        setEmptyMessage('此項目尚未綁定 AI 對談紀錄');
        return;
      }

      setLoading(true);
      setError('');
      setEmptyMessage('');
      try {
        const history = await api.getChatHistory(sessionId);
        const formatted: ChatMessage[] = [];

        history.forEach((msg: any) => {
          const authorLabel =
            msg.display_name || msg.username
              ? (msg.display_name || msg.username)
              : '使用者';

          formatted.push({
            role: 'user',
            content: msg.content,
            timestamp: msg.created_at,
            author: authorLabel
          });
          if (msg.ai_response) {
            formatted.push({
              role: 'ai',
              content: msg.ai_response,
              timestamp: msg.created_at,
              author: 'AI 助手'
            });
          }
        });

        setMessages(formatted);
        if (formatted.length === 0) {
          setEmptyMessage('尚無 AI 對談紀錄');
        }
      } catch (err: any) {
        setError(err?.response?.data?.error || '載入 AI 對談失敗，請稍後再試');
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [open, sessionId]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '840px',
          maxHeight: '80vh',
          overflow: 'hidden',
          boxShadow: '0 15px 40px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            justifyContent: 'space-between',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={18} style={{ color: '#4f46e5' }} />
            <h3 style={{ margin: 0, fontSize: '16px' }}>{headerTitle}</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#f3f4f6',
              color: '#374151',
              padding: '6px 10px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            關閉
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280' }}>
              <Loader2 className="spinner" size={28} style={{ marginBottom: '8px' }} />
              載入 AI 對談中...
            </div>
          ) : error ? (
            <div className="alert alert-error">{error}</div>
          ) : emptyMessage ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '12px 0' }}>{emptyMessage}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.map((msg, idx) => (
                <div
                  key={`${msg.timestamp}-${idx}`}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: msg.role === 'user' ? '#eef2ff' : '#f9fafb',
                      border: msg.role === 'user' ? '1px solid #c7d2fe' : '1px solid #e5e7eb',
                      color: '#111827'
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', fontWeight: 600 }}>
                      {msg.author || (msg.role === 'ai' ? 'AI 助手' : '使用者')}
                    </div>
                    {msg.role === 'ai' ? (
                      <div className="markdown-content" style={{ fontSize: '14px', lineHeight: 1.6 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p style={{ fontSize: '14px', margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                    )}
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIChatHistoryModal;
