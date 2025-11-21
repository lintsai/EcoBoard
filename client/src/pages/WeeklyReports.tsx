import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, RefreshCw, Trash2, BarChart, TrendingUp, PieChart, Activity, Download, ArrowDownUp, Maximize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import mermaid from 'mermaid';
import { exportElementAsPdf } from '../utils/pdfExport';
import api from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';

interface WeeklyReportsProps {
  user: any;
  teamId: number;
}

interface WeeklyReport {
  id: number;
  team_id: number;
  report_name: string;
  report_type: string;
  start_date: string;
  end_date: string;
  report_content?: string;
  created_at: string;
  updated_at: string;
  generated_by_name: string;
}

const reportTypeLabels: Record<string, { label: string; icon: any; color: string }> = {
  statistics: { label: '統計報表', icon: BarChart, color: '#3b82f6' },
  analysis: { label: '分析報表', icon: TrendingUp, color: '#8b5cf6' },
  burndown: { label: '燃盡圖', icon: Activity, color: '#f59e0b' },
  productivity: { label: '生產力報告', icon: TrendingUp, color: '#10b981' },
  task_distribution: { label: '任務分布', icon: PieChart, color: '#ec4899' }
};

type SortDirection = 'asc' | 'desc';

interface VisualizationPreview {
  html: string;
  type: 'table' | 'chart';
  title: string;
}

const sortReports = (items: WeeklyReport[], direction: SortDirection) => {
  return [...items].sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return direction === 'desc' ? -diff : diff;
  });
};

const MermaidChart = ({ chart }: { chart: string }) => {
  const [svgContent, setSvgContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      try {
        const { svg } = await mermaid.render(
          `mermaid-${Math.random().toString(36).slice(2)}`,
          chart
        );
        if (isMounted) {
          setSvgContent(svg);
          setError(null);
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        if (isMounted) {
          setError('Mermaid 圖表解析失敗，已顯示原始程式碼');
        }
      }
    };

    renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="mermaid-error">
        <p>{error}</p>
        <pre>{chart}</pre>
      </div>
    );
  }

  if (!svgContent) {
    return <div className="mermaid-loading">圖表載入中...</div>;
  }

  return <div className="mermaid-chart" dangerouslySetInnerHTML={{ __html: svgContent }} />;
};

export function WeeklyReports({ user, teamId }: WeeklyReportsProps) {
  const navigate = useNavigate();
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    startDate: '',
    endDate: '',
    reportType: 'statistics'
  });
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [previewContent, setPreviewContent] = useState<VisualizationPreview | null>(null);
  const [downloading, setDownloading] = useState(false);
  const reportContentRef = useRef<HTMLDivElement | null>(null);
  const markdownComponents = useMemo(
    () => ({
      code({ inline, className, children, ...props }: any) {
        const language = typeof className === 'string' ? className.replace('language-', '') : '';
        const content = String(children).replace(/\s+$/, '');
        if (!inline && language === 'mermaid') {
          return <MermaidChart chart={content} />;
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      pre({ node, children, ...props }: any) {
        const firstChild: any = node.children?.[0];
        const className = Array.isArray(firstChild?.properties?.className)
          ? firstChild.properties.className.join(' ')
          : firstChild?.properties?.className;
        if (className?.includes('language-mermaid')) {
          return <div {...props}>{children}</div>;
        }
        return <pre {...props}>{children}</pre>;
      }
    }),
    []
  );

  useEffect(() => {
    loadReports();
  }, [teamId]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral'
    });
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewContent) {
        setPreviewContent(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [previewContent]);

  useEffect(() => {
    setReports((prev) => sortReports(prev, sortDirection));
  }, [sortDirection]);

  useEffect(() => {
    setPreviewContent(null);
  }, [selectedReport]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await api.getWeeklyReports(teamId);
      setReports(sortReports(data, sortDirection));
    } catch (error: any) {
      console.error('Load reports error:', error);
      setError(error.response?.data?.error || '載入週報失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectReport = async (report: WeeklyReport) => {
    try {
      setLoading(true);
      const fullReport = await api.getWeeklyReportById(report.id, teamId);
      setSelectedReport(fullReport);
    } catch (error: any) {
      console.error('Load report detail error:', error);
      setError(error.response?.data?.error || '載入報表詳情失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createForm.startDate || !createForm.endDate) {
      setError('請選擇開始和結束日期');
      return;
    }

    if (new Date(createForm.endDate) < new Date(createForm.startDate)) {
      setError('結束日期不能早於開始日期');
      return;
    }

    try {
      setGenerating(true);
      setError('');
      const newReport = await api.generateWeeklyReport(
        teamId,
        createForm.startDate,
        createForm.endDate,
        createForm.reportType
      );

      setShowCreateModal(false);
      setCreateForm({ startDate: '', endDate: '', reportType: 'statistics' });

      // 重新載入報表列表
      await loadReports();

      // 載入完整報表內容並顯示
      const fullReport = await api.getWeeklyReportById(newReport.id, teamId);
      setSelectedReport(fullReport);

      alert('週報產生成功！');
    } catch (error: any) {
      console.error('Generate report error:', error);
      setError(error.response?.data?.error || '產生週報失敗');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateReport = async () => {
    if (!selectedReport) return;

    if (!confirm('確定要重新產生此報表嗎？這將覆蓋原有內容。')) {
      return;
    }

    try {
      setGenerating(true);
      setError('');
      const updatedReport = await api.regenerateWeeklyReport(selectedReport.id, teamId);

      // 重新載入報表列表
      await loadReports();

      // 重新載入完整報表內容
      const fullReport = await api.getWeeklyReportById(selectedReport.id, teamId);
      setSelectedReport(fullReport);

      alert('報表重新產生成功！');
    } catch (error: any) {
      console.error('Regenerate report error:', error);
      setError(error.response?.data?.error || '重新產生報表失敗');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    if (!confirm('確定要刪除此報表嗎？此操作無法復原。')) {
      return;
    }

    try {
      await api.deleteWeeklyReport(reportId, teamId);
      if (selectedReport?.id === reportId) {
        setSelectedReport(null);
      }
      await loadReports();
      alert('報表刪除成功');
    } catch (error: any) {
      console.error('Delete report error:', error);
      setError(error.response?.data?.error || '刪除報表失敗');
    }
  };

  const getDefaultDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6); // 預設最近 7 天
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // 處理報表內圖表／表格的點擊互動
  const handleVisualizationClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!reportContentRef.current) return;
    const target = e.target as Element | null;
    if (!target || !reportContentRef.current.contains(target)) {
      return;
    }

    const table = target.closest('table');
    if (table) {
      setPreviewContent({
        html: table.outerHTML,
        type: 'table',
        title: '表格'
      });
      return;
    }

    const chartElement = target.closest('svg, img, canvas');
    if (chartElement) {
      const container =
        chartElement.parentElement && chartElement.parentElement !== reportContentRef.current
          ? chartElement.parentElement
          : chartElement;

      setPreviewContent({
        html: (container as Element).outerHTML,
        type: 'chart',
        title: '圖表'
      });
    }
  };

  const closePreviewModal = () => {
    setPreviewContent(null);
  };

  // 處理報表內容顯示（防止顯示 JSON 字串）
  const getReportContent = (content?: string) => {
    if (!content) return '載入中...';

    // 檢查是否為 JSON 字串
    try {
      const parsed = JSON.parse(content);
      if (parsed.reportContent) {
        return parsed.reportContent;
      }
    } catch {
      // 不是 JSON，直接返回
    }

    return content;
  };

  const handleDownloadPdf = async () => {
    if (!selectedReport) {
      alert('請先選擇要匯出的報表');
      return;
    }

    if (!reportContentRef.current) {
      setError('找不到報表內容區塊，請重新整理頁面後再試');
      return;
    }

    try {
      setDownloading(true);
      const safeName = (selectedReport.report_name || 'weekly-report').replace(/[\\/:*?"<>|]/g, '_');
      await exportElementAsPdf(reportContentRef.current, {
        filename: `${safeName}.pdf`
      });
    } catch (error) {
      console.error('Download PDF error:', error);
      setError('PDF 下載失敗，請稍後再試');
    } finally {
      setDownloading(false);
    }
  };

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  const sortDirectionLabel = sortDirection === 'desc' ? '由新到舊' : '由舊到新';
  const nextSortButtonLabel = sortDirection === 'desc' ? '改為舊→新' : '改為新→舊';

  return (
    <div className="app-container">
      <div className="main-content">
        <Breadcrumbs />
        <div className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ marginBottom: '4px' }}>週報管理</h1>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                查看歷史週報或建立新的報表
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              const defaultRange = getDefaultDateRange();
              setCreateForm({
                ...createForm,
                startDate: defaultRange.startDate,
                endDate: defaultRange.endDate
              });
              setShowCreateModal(true);
            }}
          >
            <Plus size={18} />
            新增報表
          </button>
        </div>

        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
          {/* 左側：報表列表 */}
          <div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{
                padding: '16px',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontWeight: 600 }}>歷史報表</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={toggleSortDirection}
                  >
                    <ArrowDownUp size={14} />
                    {nextSortButtonLabel}
                  </button>
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280' }}>
                  排列方向：{sortDirectionLabel}
                </div>
              </div>

              {loading && reports.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                  載入中...
                </div>
              ) : reports.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                  尚無報表
                </div>
              ) : (
                <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                  {reports.map((report) => {
                    const typeInfo = reportTypeLabels[report.report_type];
                    const Icon = typeInfo?.icon || FileText;

                    return (
                      <div
                        key={report.id}
                        onClick={() => handleSelectReport(report)}
                        style={{
                          padding: '16px',
                          borderBottom: '1px solid #e5e7eb',
                          cursor: 'pointer',
                          backgroundColor: selectedReport?.id === report.id ? '#eff6ff' : 'white',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedReport?.id !== report.id) {
                            e.currentTarget.style.backgroundColor = '#f9fafb';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedReport?.id !== report.id) {
                            e.currentTarget.style.backgroundColor = 'white';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                          <div style={{
                            padding: '8px',
                            borderRadius: '8px',
                            backgroundColor: typeInfo?.color + '20',
                            color: typeInfo?.color
                          }}>
                            <Icon size={20} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontWeight: 600,
                              marginBottom: '4px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {report.report_name}
                            </div>
                            <div style={{
                              fontSize: '12px',
                              color: '#6b7280',
                              marginBottom: '6px'
                            }}>
                              {formatDate(report.start_date)} - {formatDate(report.end_date)}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: '#9ca3af',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                backgroundColor: typeInfo?.color + '15',
                                color: typeInfo?.color,
                                fontSize: '10px'
                              }}>
                                {typeInfo?.label}
                              </span>
                              <span>{new Date(report.created_at).toLocaleDateString('zh-TW')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 右側：報表內容 */}
          <div>
            {selectedReport ? (
              <div className="card">
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: '24px',
                  paddingBottom: '20px',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <div style={{ flex: 1 }}>
                    <h2 style={{ marginBottom: '8px' }}>{selectedReport.report_name}</h2>
                    <div style={{ display: 'flex', gap: '16px', color: '#6b7280', fontSize: '14px' }}>
                      <span>📅 {formatDate(selectedReport.start_date)} - {formatDate(selectedReport.end_date)}</span>
                      <span>•</span>
                      <span>📊 {reportTypeLabels[selectedReport.report_type]?.label}</span>
                      <span>•</span>
                      <span>👤 {selectedReport.generated_by_name}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={handleRegenerateReport}
                      disabled={generating}
                    >
                      <RefreshCw size={16} />
                      {generating ? '產生中...' : '重新產生'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleDownloadPdf}
                      disabled={downloading}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download size={16} />
                      {downloading ? '匯出中...' : '下載 PDF'}
                    </button>
                    <button
                      className="btn"
                      style={{
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none'
                      }}
                      onClick={() => handleDeleteReport(selectedReport.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div
                  className="markdown-content"
                  ref={reportContentRef}
                  onClick={handleVisualizationClick}
                  style={{
                    maxHeight: 'calc(100vh - 300px)',
                    overflowY: 'auto',
                    padding: '20px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px'
                  }}
                >
                  <div
                    data-export-hidden="true"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: '#4b5563',
                      backgroundColor: '#e0f2fe',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      marginBottom: '16px'
                    }}>
                    <Maximize2 size={14} />
                    <span>表格與圖表可點擊放大檢視，點擊外部或按 ESC 可關閉</span>
                  </div>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                    components={markdownComponents}
                  >
                    {getReportContent(selectedReport.report_content)}
                  </ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="card" style={{
                padding: '80px 40px',
                textAlign: 'center',
                color: '#6b7280'
              }}>
                <FileText size={64} style={{ margin: '0 auto 20px', opacity: 0.3 }} />
                <h3 style={{ marginBottom: '8px', color: '#374151' }}>選擇報表</h3>
                <p>從左側列表選擇一個報表查看詳細內容</p>
              </div>
            )}
          </div>
        </div>

        {/* 新增報表 Modal */}
        {showCreateModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div className="card" style={{
              width: '90%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}>
              <h2 style={{ marginBottom: '24px' }}>建立新報表</h2>

              <form onSubmit={handleCreateReport}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 500,
                    color: '#374151'
                  }}>
                    報表期間
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                        開始日期
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={createForm.startDate}
                        onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                        結束日期
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={createForm.endDate}
                        onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '12px',
                    fontWeight: 500,
                    color: '#374151'
                  }}>
                    報表類型
                  </label>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {Object.entries(reportTypeLabels).map(([type, info]) => {
                      const Icon = info.icon;
                      return (
                        <div
                          key={type}
                          onClick={() => setCreateForm({ ...createForm, reportType: type })}
                          style={{
                            padding: '16px',
                            border: `2px solid ${createForm.reportType === type ? info.color : '#e5e7eb'}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            backgroundColor: createForm.reportType === type ? info.color + '10' : 'white',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{
                            padding: '8px',
                            borderRadius: '6px',
                            backgroundColor: info.color + '20',
                            color: info.color
                          }}>
                            <Icon size={20} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#374151' }}>{info.label}</div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                              {type === 'statistics' && '詳細的統計數據報表，包含完成率、成員貢獻度等'}
                              {type === 'analysis' && '深度分析團隊績效和工作模式，提供改善建議'}
                              {type === 'burndown' && '燃盡圖分析，追蹤工作完成趨勢'}
                              {type === 'productivity' && '評估團隊和個人的工作效率指標'}
                              {type === 'task_distribution' && '分析任務分配的合理性和工作量均衡'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowCreateModal(false);
                      setError('');
                    }}
                    disabled={generating}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={generating}
                  >
                    {generating ? '產生中...' : '產生報表'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: '20px', background: '#f9fafb' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px', color: '#374151' }}>💡 週報小提示</h3>
          <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#6b7280' }}>
            <li><strong style={{ color: '#0f172a' }}>建立報表時選擇起訖日期</strong>，系統會拉取該期間的打卡、工作項目與進度更新，建立前請確認日期範圍正確。</li>
            <li>若資料不完整（成員未打卡或工作項目缺漏），請先回對應頁面補齊後<strong style={{ color: '#2563eb' }}>重新產生報表</strong>，內容會自動更新。</li>
            <li>報表類型：<strong style={{ color: '#047857' }}>統計報表</strong>（數字統計）、<strong style={{ color: '#8b5cf6' }}>分析報表</strong>（深度分析）、<strong style={{ color: '#f59e0b' }}>燃盡圖</strong>（進度趨勢）、<strong style={{ color: '#10b981' }}>生產力報告</strong>（效率分析）、<strong style={{ color: '#ec4899' }}>任務分布</strong>（工作分配）。</li>
            <li>報表內的表格與圖表可<strong style={{ color: '#b91c1c' }}>點擊放大檢視</strong>，確認無誤後再點「下載 PDF」匯出（按 ESC 或點外部關閉預覽）。</li>
          </ul>
        </div>

        {/* 視覺化放大 Modal */}
        {previewContent && (
          <div
            className="table-modal-overlay"
            onClick={closePreviewModal}
          >
            <div
              className="table-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="table-modal-close"
                onClick={closePreviewModal}
                title="關閉"
              >
                ×
              </button>
              <div style={{ marginBottom: '12px', fontWeight: 600, color: '#111827' }}>
                放大檢視：{previewContent.title}
              </div>
              <div dangerouslySetInnerHTML={{ __html: previewContent.html }} />
              <div className="table-modal-hint">
                {previewContent.type === 'chart' ? '圖表' : '表格'}可點擊外部或按 ESC 關閉，也可以使用滑鼠滾輪調整大小
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default WeeklyReports;
