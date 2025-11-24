import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, History, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Breadcrumbs from '../components/Breadcrumbs';
import PriorityBadge from '../components/PriorityBadge';
import api from '../services/api';

interface CompletedHistoryProps {
  user: any;
  teamId: number;
  onLogout: () => void;
}

type HistorySort = 'completed_desc' | 'completed_asc' | 'id_desc' | 'id_asc';
type StatusFilter = 'all' | 'completed' | 'cancelled';

interface CompletedHistoryItem {
  id: number;
  ai_title?: string;
  ai_summary?: string | null;
  content: string;
  priority?: number;
  estimated_date?: string | null;
  completed_at: string;
  update_content?: string | null;
  status?: string | null;
  team_name?: string | null;
  derived_team_id?: number | null;
  completed_by_name?: string | null;
  completed_by_username?: string | null;
  primary_handler_name?: string | null;
  primary_handler_username?: string | null;
}

interface WorkUpdate {
  id: number;
  work_item_id: number;
  user_id: number;
  update_content: string;
  progress_status: string;
  updated_at: string;
  username?: string;
  display_name?: string;
}

interface HistoryFilterState {
  startDate: string;
  endDate: string;
  keyword: string;
  limit: number;
}

const formatLocalISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultHistoryRange = () => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 14);
  return {
    startDate: formatLocalISODate(start),
    endDate: formatLocalISODate(today)
  };
};

const createDefaultFilters = (): HistoryFilterState => {
  const range = getDefaultHistoryRange();
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    keyword: '',
    limit: 30
  };
};

const formatHistoryDateTime = (value: string) => {
  try {
    return new Date(value).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return value;
  }
};

function CompletedHistory({ teamId }: CompletedHistoryProps) {
  const navigate = useNavigate();
  const [historyFiltersInput, setHistoryFiltersInput] = useState<HistoryFilterState>(createDefaultFilters);
  const [appliedHistoryFilters, setAppliedHistoryFilters] = useState<HistoryFilterState>(createDefaultFilters);
  const [completedHistory, setCompletedHistory] = useState<CompletedHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<HistorySort>('completed_desc');
  const [sortByInput, setSortByInput] = useState<HistorySort>('completed_desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [statusFilterInput, setStatusFilterInput] = useState<StatusFilter>('all');
  const [viewingUpdate, setViewingUpdate] = useState<CompletedHistoryItem | null>(null);
  const [updateLogs, setUpdateLogs] = useState<WorkUpdate[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatesError, setUpdatesError] = useState('');
  const [enlargedTable, setEnlargedTable] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(() => new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState({
    total: 0,
    totalPages: 1,
    limit: historyFiltersInput.limit,
    page: 1
  });

  const loadCompletedHistory = async (
    filtersOverride?: HistoryFilterState,
    pageOverride?: number,
    statusOverride?: StatusFilter,
    sortOverride?: HistorySort
  ) => {
    const filters = filtersOverride || appliedHistoryFilters;
    const targetPage = pageOverride ?? currentPage;
    const targetStatus = statusOverride ?? statusFilter;
    const targetSort = sortOverride ?? sortBy;

    if (!teamId) {
      setCompletedHistory([]);
      setPaginationInfo((prev) => ({
        ...prev,
        total: 0,
        totalPages: 1,
        page: 1,
        limit: filters.limit
      }));
      setCurrentPage(1);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await api.getCompletedWorkHistory({
        teamId,
        startDate: filters.startDate,
        endDate: filters.endDate,
        keyword: filters.keyword || undefined,
        limit: filters.limit,
        page: targetPage,
        status: targetStatus === 'all' ? undefined : targetStatus,
        sortBy: targetSort
      });

      const items = Array.isArray(data) ? data : data?.items ?? [];
      setCompletedHistory(items);

      if (!Array.isArray(data) && data?.pagination) {
        const totalPages = Math.max(1, data.pagination.totalPages || 1);
        setPaginationInfo({
          total: data.pagination.total,
          totalPages,
          limit: data.pagination.limit ?? filters.limit,
          page: data.pagination.page ?? targetPage
        });
        setCurrentPage(data.pagination.page ?? targetPage);
      } else {
        setPaginationInfo({
          total: items.length,
          totalPages: 1,
          limit: filters.limit,
          page: targetPage
        });
        setCurrentPage(targetPage);
      }
    } catch (err: any) {
      console.error('Load completed history error:', err);
      setError(err.response?.data?.error || '載入已完成項目失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!teamId) {
      setCompletedHistory([]);
      setPaginationInfo((prev) => ({
        ...prev,
        total: 0,
        totalPages: 1,
        page: 1
      }));
      setCurrentPage(1);
      return;
    }
    setCurrentPage(1);
    loadCompletedHistory(appliedHistoryFilters, 1);
  }, [teamId]);

  useEffect(() => {
    const handleTableClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const table = target.closest('.markdown-content table');
      if (table && !target.closest('.table-modal-content')) {
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

  const handleHistoryFilterChange = (field: keyof HistoryFilterState, value: string | number) => {
    setHistoryFiltersInput((prev) => ({
      ...prev,
      [field]: field === 'limit' ? Number(value) : String(value)
    }));
  };

  const handleApplyHistoryFilters = () => {
    const nextFilters = { ...historyFiltersInput };
    setAppliedHistoryFilters(nextFilters);
    setSortBy(sortByInput);
    setStatusFilter(statusFilterInput);
    setCurrentPage(1);
    loadCompletedHistory(nextFilters, 1, statusFilterInput, sortByInput);
  };

  const handleResetHistoryFilters = () => {
    const nextFilters = createDefaultFilters();
    setHistoryFiltersInput(nextFilters);
    setAppliedHistoryFilters(nextFilters);
    setSortBy('completed_desc');
    setSortByInput('completed_desc');
    setStatusFilter('all');
    setStatusFilterInput('all');
    setCurrentPage(1);
    loadCompletedHistory(nextFilters, 1, 'all', 'completed_desc');
  };

  const toggleItemExpanded = (itemId: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const totalPagesDisplay = Math.max(1, paginationInfo.totalPages || 1);
  const hasItems = completedHistory.length > 0 && paginationInfo.total > 0;
  const startIndex = hasItems ? (paginationInfo.page - 1) * paginationInfo.limit + 1 : 0;
  const endIndex = hasItems ? startIndex + completedHistory.length - 1 : 0;
  const statusLabelMap: Record<StatusFilter, string> = {
    all: '全部狀態',
    completed: '僅顯示已完成',
    cancelled: '僅顯示已取消'
  };
  const canPrev = paginationInfo.page > 1;
  const canNext = paginationInfo.page < totalPagesDisplay && paginationInfo.total > 0;
  const currentPageDisplay = Math.min(paginationInfo.page, totalPagesDisplay);

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1) {
      return;
    }
    const maxPages = Math.max(1, paginationInfo.totalPages || 1);
    if (nextPage > maxPages || nextPage === currentPage) {
      return;
    }
    setCurrentPage(nextPage);
    loadCompletedHistory(undefined, nextPage);
  };

  const getStatusBadge = (status?: string | null) => {
    const normalized = status === 'cancelled' ? 'cancelled' : 'completed';
    const config =
      normalized === 'cancelled'
        ? { label: '已取消', color: '#b45309', bg: '#fef3c7' }
        : { label: '已完成', color: '#047857', bg: '#d1fae5' };

    return (
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: config.color,
          backgroundColor: config.bg,
          padding: '2px 8px',
          borderRadius: '999px',
          display: 'inline-flex',
          alignItems: 'center',
          lineHeight: 1
        }}
      >
        {config.label}
      </span>
    );
  };

  const getProgressStatusBadge = (status?: string | null) => {
    const map: Record<string, { label: string; color: string; bg: string }> = {
      not_started: { label: '未開始', color: '#4b5563', bg: '#e5e7eb' },
      in_progress: { label: '進行中', color: '#1d4ed8', bg: '#dbeafe' },
      blocked: { label: '受阻', color: '#b91c1c', bg: '#fee2e2' },
      completed: { label: '已完成', color: '#047857', bg: '#d1fae5' },
      cancelled: { label: '已取消', color: '#92400e', bg: '#fef3c7' }
    };
    const normalized = status && map[status] ? status : 'in_progress';
    const config = map[normalized];
    return (
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: config.color,
          backgroundColor: config.bg,
          padding: '2px 8px',
          borderRadius: '999px',
          display: 'inline-flex',
          alignItems: 'center',
          lineHeight: 1
        }}
      >
        {config.label}
      </span>
    );
  };

  const handleViewUpdates = async (item: CompletedHistoryItem) => {
    setViewingUpdate(item);
    setUpdateLogs([]);
    setUpdatesError('');
    setUpdatesLoading(true);
    try {
      const logs = await api.getWorkItemUpdates(item.id);
      setUpdateLogs(Array.isArray(logs) ? logs : []);
    } catch (err: any) {
      setUpdatesError(err?.response?.data?.error || '載入更新紀錄失敗');
    } finally {
      setUpdatesLoading(false);
    }
  };

  const closeUpdateModal = () => {
    setViewingUpdate(null);
    setUpdateLogs([]);
    setUpdatesError('');
  };

  return (
    <div className="app-container">
      <div className="main-content">
        <Breadcrumbs />
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginBottom: '16px' }}>
          <ArrowLeft size={18} />
          返回儀表板
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div>
            <h1 style={{ marginBottom: '6px' }}>已完成項目調閱</h1>
            <p style={{ color: '#475467' }}>查看近期標記完成的工作項目，支援日期、關鍵字與筆數限制，方便回顧團隊成果。</p>
          </div>
          <button className="btn btn-secondary" onClick={() => loadCompletedHistory()} disabled={loading}>
            重新整理
          </button>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <History size={22} style={{ color: '#dc2626' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#0f172a' }}>調閱條件</h3>
              <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '13px' }}>設定時間區間與關鍵字後按下「套用條件」，系統將重新查詢符合的完成項目。</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#475467' }}>開始日期</label>
              <input
                type="date"
                value={historyFiltersInput.startDate}
                max={historyFiltersInput.endDate}
                onChange={(e) => handleHistoryFilterChange('startDate', e.target.value)}
                className="input"
                style={{ minWidth: '150px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#475467' }}>結束日期</label>
              <input
                type="date"
                value={historyFiltersInput.endDate}
                min={historyFiltersInput.startDate}
                max={formatLocalISODate(new Date())}
                onChange={(e) => handleHistoryFilterChange('endDate', e.target.value)}
                className="input"
                style={{ minWidth: '150px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px' }}>
              <label style={{ fontSize: '12px', color: '#475467' }}>關鍵字</label>
              <input
                type="text"
                value={historyFiltersInput.keyword}
                onChange={(e) => handleHistoryFilterChange('keyword', e.target.value)}
                placeholder="搜尋標題、內容或備註"
                className="input"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#475467' }}>顯示筆數</label>
              <select
                value={historyFiltersInput.limit}
                onChange={(e) => handleHistoryFilterChange('limit', Number(e.target.value))}
                className="input"
              >
                {[10, 20, 30, 50].map((limit) => (
                  <option value={limit} key={limit}>{limit}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#475467' }}>排序方式</label>
              <select
                value={sortByInput}
                onChange={(e) => setSortByInput(e.target.value as HistorySort)}
                className="input"
              >
                <option value="completed_desc">完成時間（新 → 舊）</option>
                <option value="completed_asc">完成時間（舊 → 新）</option>
                <option value="id_desc">工作項目 ID（大 → 小）</option>
                <option value="id_asc">工作項目 ID（小 → 大）</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', color: '#475467' }}>狀態篩選</label>
              <select
                value={statusFilterInput}
                onChange={(e) => setStatusFilterInput(e.target.value as StatusFilter)}
                className="input"
              >
                <option value="all">全部狀態</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleApplyHistoryFilters} disabled={loading}>
                套用條件
              </button>
              <button className="btn btn-secondary" onClick={handleResetHistoryFilters} disabled={loading}>
                重設
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
            {!loading && !error && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                  marginBottom: '12px'
                }}
              >
                <div style={{ fontSize: '12px', color: '#475467', lineHeight: 1.6 }}>
                  <div>
                    顯示筆數：{hasItems ? `${startIndex} - ${endIndex}` : '0'} / 共{' '}
                    {paginationInfo.total} 筆
                  </div>
                  <div>篩選狀態：{statusLabelMap[statusFilter]}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 12px', fontSize: '12px' }}
                    disabled={!canPrev || loading}
                    onClick={() => handlePageChange(paginationInfo.page - 1)}
                  >
                    上一頁
                  </button>
                  <span style={{ fontSize: '12px', color: '#111827' }}>
                    第 {currentPageDisplay} / {totalPagesDisplay} 頁
                  </span>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 12px', fontSize: '12px' }}
                    disabled={!canNext || loading}
                    onClick={() => handlePageChange(paginationInfo.page + 1)}
                  >
                    下一頁
                  </button>
                </div>
              </div>
            )}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Loader2 size={32} className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : error ? (
              <div className="alert alert-error" style={{ marginBottom: 0 }}>
                {error}
              </div>
            ) : completedHistory.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#6b7280', padding: '20px 0' }}>
                尚無符合條件的完成項目
              </p>
            ) : (
              completedHistory.map((item) => {
                const summary = item.ai_summary || item.ai_title || item.content;
                const isExpanded = expandedItems.has(item.id);

                return (
                    <div
                      key={`${item.id}-${item.completed_at}`}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '12px',
                        background: '#ffffff'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleItemExpanded(item.id)}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <h4 style={{ fontSize: '14px', margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  #{item.id} {item.ai_title || item.content}
                                </h4>
                                <PriorityBadge priority={item.priority} />
                                {getStatusBadge(item.status)}
                              </div>
                              <div style={{ fontSize: '12px', color: '#475467', display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                                <span>📅 {formatHistoryDateTime(item.completed_at)}</span>
                                <span>
                                  🏷️ {item.team_name || (item.derived_team_id ? `團隊 #${item.derived_team_id}` : '未指定團隊')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <>
                          {summary && (
                            <div className="markdown-content" style={{ fontSize: '13px', color: '#1f2937', marginTop: '10px' }}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                            </div>
                          )}

                          <div style={{ marginTop: '10px', fontSize: '12px', color: '#475467', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span>主要處理人：{item.primary_handler_name || item.primary_handler_username || '未指定'}</span>
                              {item.estimated_date && (
                                <span>🎯 預計 {item.estimated_date}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span>
                                {item.status === 'cancelled' ? '標記取消' : '標記完成'}：{item.completed_by_name || item.completed_by_username || '未知'}
                              </span>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                onClick={() => handleViewUpdates(item)}
                              >
                                查看更新資訊
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                );
              })
            )}
          </div>
        </div>
        {viewingUpdate && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: '20px'
            }}
            onClick={closeUpdateModal}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: '10px',
                maxWidth: '720px',
                width: '100%',
                maxHeight: '80vh',
                overflowY: 'auto',
                padding: '24px',
                position: 'relative'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeUpdateModal}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '18px',
                  cursor: 'pointer'
                }}
                aria-label="close update modal"
              >
                ×
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>
                  #{viewingUpdate.id} 更新資訊
                </h3>
                {getStatusBadge(viewingUpdate.status)}
              </div>
              <div style={{ fontSize: '13px', color: '#475467', marginBottom: '12px' }}>
                完成於 {formatHistoryDateTime(viewingUpdate.completed_at)} ·{' '}
                {viewingUpdate.status === 'cancelled' ? '標記取消' : '標記完成'}：{viewingUpdate.completed_by_name || viewingUpdate.completed_by_username || '未知'}
              </div>
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                {updatesLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <Loader2 size={28} className="spinner" style={{ margin: '0 auto' }} />
                    <div style={{ marginTop: '8px', color: '#6b7280', fontSize: '13px' }}>載入更新紀錄中...</div>
                  </div>
                ) : updatesError ? (
                  <div className="alert alert-error">
                    {updatesError}
                  </div>
                ) : updateLogs.length === 0 ? (
                  <p style={{ fontSize: '14px', color: '#6b7280' }}>
                    此項目尚未有更新紀錄。
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {updateLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          padding: '12px',
                          backgroundColor: '#f9fafb'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '13px', color: '#111827' }}>
                              {log.display_name || log.username || `成員 #${log.user_id}`}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              更新於 {formatHistoryDateTime(log.updated_at)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {getProgressStatusBadge(log.progress_status)}
                          </div>
                        </div>
                        {log.update_content && (
                          <div className="markdown-content" style={{ fontSize: '13px', color: '#1f2937', marginTop: '8px' }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {log.update_content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {enlargedTable && (
          <div className="table-modal-overlay" onClick={() => setEnlargedTable(null)}>
            <div className="table-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="table-modal-close" onClick={() => setEnlargedTable(null)}>
                ×
              </button>
              <div dangerouslySetInnerHTML={{ __html: enlargedTable }} />
              <div className="table-modal-hint">
                小提示：點擊外部或按下 ESC 可以關閉視窗
              </div>
            </div>
          </div>
        )}
        <div className="card" style={{ marginTop: '20px', background: '#f9fafb' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#374151' }}>💡 調閱小提示</h3>
          <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#6b7280' }}>
            <li>
              <strong style={{ color: '#0f172a' }}>列表預設折疊</strong>，點標題即可展開/收合，快速瀏覽 <strong style={{ color: '#2563eb' }}>AI 摘要</strong> 與詳細內容。
            </li>
            <li>
              <strong style={{ color: '#047857' }}>狀態篩選</strong> 可切換「已完成 / 已取消」，鎖定需要追蹤的紀錄類型。
            </li>
            <li>
              點 <strong style={{ color: '#b91c1c' }}>查看更新資訊</strong> 會載入所有更新與狀態變更，完整還原工作脈絡。
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default CompletedHistory;
