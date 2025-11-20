import { useState, useEffect, useRef, useCallback, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Clock, CheckCircle, AlertCircle, Loader2, Sparkles, TrendingUp, ChevronDown, ChevronUp, UserPlus, ArrowUpDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';
import Breadcrumbs from '../components/Breadcrumbs';

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

interface WorkItemHandler {
  user_id: number;
  username: string;
  display_name: string;
}

interface WorkItem {
  id: number;
  user_id: number;
  checkin_id?: number | null;
  checkin_date?: string;
  username: string;
  display_name: string;
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
    primary: WorkItemHandler | null;
    co_handlers: WorkItemHandler[];
  };
}

interface StandupSessionInfo {
  startTime: number;
  durationMs: number;
  startedBy?: string;
  requiredParticipants: number | null;
}

interface ActiveParticipant {
  userId: number;
  username?: string;
  displayName?: string;
}

const getParticipantDisplayName = (participant: ActiveParticipant) =>
  participant.displayName || participant.username || `成員#${participant.userId}`;

const getParticipantInitials = (participant: ActiveParticipant) => {
  const label = getParticipantDisplayName(participant).replace(/\s+/g, '');
  if (!label) {
    return '成員';
  }
  return label.slice(0, 2).toUpperCase();
};

type ToastVariant = 'info' | 'success' | 'warning';

interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface RealtimeLogEntry {
  id: string;
  timestamp: string;
  message: string;
}

type SocketStatus = 'connecting' | 'connected' | 'disconnected';

interface StandupReviewProps {
  user: any;
  teamId: number;
  onLogout?: () => void;
}

const describeRealtimeEvent = (event: any) => {
  const actorName = event?.metadata?.actorName || '系統';
  switch (event?.action) {
    case 'checkin-created':
      return `${actorName} 完成打卡`;
    case 'workitem-created':
      return `${actorName} 建立了一個工作項目`;
    case 'workitem-updated':
      return `${actorName} 更新了工作項目內容`;
    case 'workitem-progress':
      return `${actorName} 更新了工作項目進度`;
    case 'workitem-reassigned':
      return `${actorName} 重新指派了工作項目`;
    case 'workitem-moved-to-today':
      return `${actorName} 將 Backlog 項目加入今日清單`;
    case 'workitem-deleted':
      return `${actorName} 刪除了工作項目`;
    case 'workitem-cohandler-added':
      return `${actorName} 新增了共同負責人`;
    case 'workitem-cohandler-removed':
      return `${actorName} 移除了共同負責人`;
    case 'backlog-promoted':
      return `${actorName} 推進了一個 Backlog 項目`;
    case 'standup-session-started':
      return `${actorName} 開始了 15 分鐘站立會議`;
    case 'standup-session-warning': {
      const over = event?.metadata?.overMinutes ?? 0;
      if (over <= 0) {
        return '站立會議時間已用盡';
      }
      return `站立會議已超時 ${over} 分鐘`;
    }
    case 'standup-session-ended':
      return `${actorName} 結束了站立會議`;
    case 'standup-participant-joined':
      return `${actorName} 加入了站立會議`;
    case 'standup-participant-left':
      return `${actorName} 離開了站立會議`;
    default:
      return `${actorName} 更新了站立會議資訊`;
  }
};

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

const normalizeEstimatedDate = (value?: string | null) => {
  if (!value) {
    return null;
  }
  return value.includes('T') ? value.split('T')[0] : value;
};

function getStatusBadge(status?: string) {
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
        text: '尚未開始',
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
        text: '未知狀態',
        icon: <Clock size={12} />,
        color: '#92400e',
        bgColor: '#fef3c7'
      };
  }
}

const formatEstimatedDateLabel = (value?: string | null) => {
  const normalized = normalizeEstimatedDate(value || null);
  if (!normalized) {
    return '未設定';
  }
  const [year, month, day] = normalized.split('-');
  const parsedMonth = parseInt(month, 10);
  const parsedDay = parseInt(day, 10);
  if (Number.isNaN(parsedMonth) || Number.isNaN(parsedDay)) {
    return normalized;
  }
  return `${parsedMonth}/${parsedDay}`;
};

const stopEvent = (e: SyntheticEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const nativeEvent = e.nativeEvent as Event & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
};

const renderItemMetaBadges = (item: WorkItem, estimatedColor = '#0891b2') => {
  const statusBadge = getStatusBadge(item.progress_status);
  return (
    <>
      {getPriorityBadge(item.priority)}
      <span
        style={{
          fontSize: '11px',
          color: item.estimated_date ? estimatedColor : '#999'
        }}
      >
        📅 預計時間：{formatEstimatedDateLabel(item.estimated_date)}
      </span>
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
    </>
  );
};

function StandupReview({ user, teamId }: StandupReviewProps) {
  const navigate = useNavigate();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [incompleteItems, setIncompleteItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [error, setError] = useState('');
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set());
  const [expandedWorkItems, setExpandedWorkItems] = useState<Set<string | number>>(new Set());
  const [showAllWorkItems, setShowAllWorkItems] = useState(true);
  const [showIncompleteItems, setShowIncompleteItems] = useState(true);
  const [assigningItem, setAssigningItem] = useState<number | null>(null);
  const [enlargedTable, setEnlargedTable] = useState<string | null>(null);
  const [showHandlerModal, setShowHandlerModal] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [editingWorkItem, setEditingWorkItem] = useState<WorkItem | null>(null);
  const [selectedPrimaryHandler, setSelectedPrimaryHandler] = useState<number | null>(null);
  const [selectedCoHandlers, setSelectedCoHandlers] = useState<number[]>([]);
  const [selectedPriority, setSelectedPriority] = useState(3);
  const [sortBy, setSortBy] = useState<'priority' | 'estimated_date'>('priority');
  const [participantStats, setParticipantStats] = useState({ required: 0, current: 0 });
  const [activeParticipants, setActiveParticipants] = useState<ActiveParticipant[]>([]);
  const [participantPanelPosition, setParticipantPanelPosition] = useState<'top' | 'bottom'>('bottom');
  const [participantPanelCollapsed, setParticipantPanelCollapsed] = useState(false);
  const [participantPanelMinimized, setParticipantPanelMinimized] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<StandupSessionInfo | null>(null);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [overdueMinutes, setOverdueMinutes] = useState<number | null>(null);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<string | null>(null);
  const [lastRealtimeTimestamp, setLastRealtimeTimestamp] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('disconnected');
  const [forcingStart, setForcingStart] = useState(false);
  const [forcingStop, setForcingStop] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [connectionLogs, setConnectionLogs] = useState<RealtimeLogEntry[]>([]);
  const logStorageKey = typeof teamId === 'number' ? `standup-review-logs:${teamId}` : null;

  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef<Record<number, number>>({});
  const serverTimeOffsetRef = useRef(0);
  const countdownIntervalRef = useRef<number | null>(null);
  const lastOverdueToastRef = useRef<number | null>(null);
  const twoMinuteWarningShownRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const socketStatusLabel =
    socketStatus === 'connected'
      ? '已連線'
      : socketStatus === 'connecting'
        ? '連線中'
        : '已中斷';

  const socketStatusColor =
    socketStatus === 'connected'
      ? '#10b981'
      : socketStatus === 'connecting'
        ? '#f59e0b'
        : '#ef4444';

  const isCountdownReady = typeof countdownMs === 'number';
  const isCountdownPositive = isCountdownReady && countdownMs > 0;
  const isCountdownExpired = isCountdownReady && countdownMs <= 0;

  const sortItems = (items: WorkItem[]) => {
    const compareByPriority = (a: WorkItem, b: WorkItem) => {
      const priorityDiff = (a.priority ?? 3) - (b.priority ?? 3);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };

    const compareByEstimatedDate = (a: WorkItem, b: WorkItem) => {
      const dateA = normalizeEstimatedDate(a.estimated_date || null);
      const dateB = normalizeEstimatedDate(b.estimated_date || null);
      if (!dateA && !dateB) {
        return compareByPriority(a, b);
      }
      if (!dateA) {
        return 1;
      }
      if (!dateB) {
        return -1;
      }
      const dateDiff = dateA.localeCompare(dateB);
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return compareByPriority(a, b);
    };

    if (sortBy === 'priority') {
      return [...items].sort(compareByPriority);
    }
    return [...items].sort(compareByEstimatedDate);
  };

  const formatCountdown = (ms?: number | null) => {
    if (typeof ms !== 'number' || Number.isNaN(ms)) {
      return '--:--';
    }
    if (ms <= 0) {
      return '00:00';
    }
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (toastTimeoutsRef.current[id]) {
      window.clearTimeout(toastTimeoutsRef.current[id]);
      delete toastTimeoutsRef.current[id];
    }
  }, []);

  const showToast = useCallback(
    (message: string, variant: 'info' | 'success' | 'warning' = 'info') => {
      const id = toastIdRef.current + 1;
      toastIdRef.current = id;
      setToasts((prev) => [...prev, { id, message, variant }]);
      toastTimeoutsRef.current[id] = window.setTimeout(() => removeToast(id), 4500);
    },
    [removeToast]
  );

  const persistLogs = useCallback((logs: RealtimeLogEntry[]) => {
    if (!logStorageKey || typeof window === 'undefined') {
      return;
    }
    try {
      window.sessionStorage.setItem(logStorageKey, JSON.stringify(logs));
    } catch (error) {
      console.error('Failed to persist standup logs', error);
    }
  }, [logStorageKey]);

  const appendRealtimeLog = useCallback((message: string) => {
    if (!message) {
      return;
    }
    const timestamp = new Date().toLocaleTimeString('zh-TW', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setLastRealtimeEvent(message);
    setLastRealtimeTimestamp(timestamp);
    setConnectionLogs((prev) => {
      const entry: RealtimeLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp,
        message
      };
      const next = [entry, ...prev].slice(0, 50);
      persistLogs(next);
      return next;
    });
  }, [persistLogs]);

  const clearConnectionLogs = useCallback(() => {
    setConnectionLogs([]);
    setLastRealtimeEvent(null);
    setLastRealtimeTimestamp(null);
    if (logStorageKey && typeof window !== 'undefined') {
      window.sessionStorage.removeItem(logStorageKey);
    }
  }, [logStorageKey]);

  const syncServerTime = (serverTimestamp?: number) => {
    if (typeof serverTimestamp === 'number' && Number.isFinite(serverTimestamp)) {
      serverTimeOffsetRef.current = Date.now() - serverTimestamp;
    }
  };

  const buildSessionInfoFromPayload = (payload: any): StandupSessionInfo => {
    const durationMs = payload?.durationMs || 15 * 60 * 1000;
    const startTime =
      typeof payload?.startTime === 'number' && Number.isFinite(payload.startTime)
        ? payload.startTime
        : (() => {
            const serverTimestamp =
              typeof payload?.serverTimestamp === 'number'
                ? payload.serverTimestamp
                : Date.now() - serverTimeOffsetRef.current;
            const remaining =
              typeof payload?.remainingMs === 'number' && Number.isFinite(payload.remainingMs)
                ? payload.remainingMs
                : durationMs;
            return serverTimestamp - (durationMs - remaining);
          })();
    return {
      startTime,
      durationMs,
      startedBy: payload?.startedBy,
      requiredParticipants:
        typeof payload?.requiredParticipants === 'number' ? payload.requiredParticipants : null
    };
  };

const loadStandupData = useCallback(
  async (options: { silent?: boolean } = {}) => {
    const { silent = false } = options;

    if (!silent) {
      setLoading(true);
      setError('');
    }
    
    try {
      const [membersData, checkinsData, workItemsData, incompleteItemsData] = await Promise.all([
        api.getTeamMembers(teamId),
        api.getTodayTeamCheckins(teamId),
        api.getTodayTeamWorkItems(teamId),
        api.getIncompleteTeamWorkItems(teamId)
      ]);

      setTeamMembers(membersData);
      setCheckins(checkinsData);
      setWorkItems(workItemsData);
      setIncompleteItems(incompleteItemsData);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || '載入站立會議資料失敗，請稍後再試';
      if (silent) {
        showToast(message, 'warning');
      } else {
        setError(message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  },
  [teamId, showToast]
);

  useEffect(() => {
    if (teamId) {
      loadStandupData();
    }
  }, [teamId, loadStandupData, appendRealtimeLog, showToast]);

  useEffect(() => {
    setParticipantStats({ required: 0, current: 0 });
    setSessionInfo(null);
    setOverdueMinutes(null);
    setActiveParticipants([]);
  }, [teamId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedPosition = window.localStorage.getItem('standupParticipantPanelPosition');
    if (storedPosition === 'top' || storedPosition === 'bottom') {
      setParticipantPanelPosition(storedPosition);
    }
    const storedCollapsed = window.localStorage.getItem('standupParticipantPanelCollapsed');
    if (storedCollapsed === '1') {
      setParticipantPanelCollapsed(true);
    }
    const storedMinimized = window.localStorage.getItem('standupParticipantPanelMinimized');
    if (storedMinimized === '1') {
      setParticipantPanelMinimized(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem('standupParticipantPanelPosition', participantPanelPosition);
  }, [participantPanelPosition]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      'standupParticipantPanelCollapsed',
      participantPanelCollapsed ? '1' : '0'
    );
  }, [participantPanelCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      'standupParticipantPanelMinimized',
      participantPanelMinimized ? '1' : '0'
    );
  }, [participantPanelMinimized]);

  useEffect(() => {
    if (!logStorageKey || typeof window === 'undefined') {
      setConnectionLogs([]);
      setLastRealtimeEvent(null);
      setLastRealtimeTimestamp(null);
      return;
    }
    try {
      const stored = window.sessionStorage.getItem(logStorageKey);
      if (stored) {
        const parsed: RealtimeLogEntry[] = JSON.parse(stored);
        setConnectionLogs(parsed);
        if (parsed.length > 0) {
          setLastRealtimeEvent(parsed[0].message);
          setLastRealtimeTimestamp(parsed[0].timestamp);
        } else {
          setLastRealtimeEvent(null);
          setLastRealtimeTimestamp(null);
        }
      } else {
        setConnectionLogs([]);
        setLastRealtimeEvent(null);
        setLastRealtimeTimestamp(null);
      }
    } catch (error) {
      console.error('Failed to load standup logs from sessionStorage', error);
      setConnectionLogs([]);
      setLastRealtimeEvent(null);
      setLastRealtimeTimestamp(null);
    }
  }, [logStorageKey]);

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
    // 預設展開所有成員區塊，方便檢視
    if (teamMembers.length > 0) {
      setExpandedMembers(new Set(teamMembers.map((m) => m.user_id)));
    }
  }, [teamMembers]);

  useEffect(() => () => {
    Object.values(toastTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    toastTimeoutsRef.current = {};
  }, []);
  useEffect(() => {
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (!sessionInfo) {
      setCountdownMs(null);
      twoMinuteWarningShownRef.current = false;
      return;
    }

    twoMinuteWarningShownRef.current = false;

    const updateCountdown = () => {
      const serverNow = Date.now() - serverTimeOffsetRef.current;
      const elapsed = serverNow - sessionInfo.startTime;
      setCountdownMs(sessionInfo.durationMs - elapsed);
    };

    updateCountdown();
    countdownIntervalRef.current = window.setInterval(updateCountdown, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [sessionInfo]);

  useEffect(() => {
    if (!sessionInfo || typeof countdownMs !== 'number') {
      setOverdueMinutes((prev) => (prev !== null ? null : prev));
      return;
    }

    if (countdownMs > 0) {
      setOverdueMinutes((prev) => (prev !== null ? null : prev));
      return;
    }

    const minutesOver = Math.max(0, Math.floor(Math.abs(countdownMs) / 60000));
    setOverdueMinutes((prev) => (prev === minutesOver ? prev : minutesOver));
  }, [countdownMs, sessionInfo]);


  useEffect(() => {
    if (typeof overdueMinutes === 'number') {
      if (lastOverdueToastRef.current !== overdueMinutes) {
        const message =
          overdueMinutes === 0
            ? '站立會議時間已到，請儘速進入結尾。'
            : `站立會議已超過 ${overdueMinutes} 分鐘，請盡快收斂。`;
        showToast(message, 'warning');
        lastOverdueToastRef.current = overdueMinutes;
      }
    } else {
      lastOverdueToastRef.current = null;
    }
  }, [overdueMinutes, showToast]);

  useEffect(() => {
    if (!sessionInfo || typeof countdownMs !== 'number') {
      twoMinuteWarningShownRef.current = false;
      return;
    }

    if (countdownMs <= 0) {
      twoMinuteWarningShownRef.current = true;
      return;
    }

    if (!twoMinuteWarningShownRef.current && countdownMs <= 2 * 60 * 1000) {
      showToast('站立會議還有 2 分鐘，請儘速收斂討論。', 'warning');
      twoMinuteWarningShownRef.current = true;
    }
  }, [sessionInfo, countdownMs, showToast]);

  useEffect(() => {
    if (!teamId) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    let cancelled = false;
    let reconnectDelay = 2000;

    const resolveSocketUrl = () => {
      const override = import.meta.env.VITE_WS_URL;
      const encodedToken = encodeURIComponent(token);
      if (override) {
        const trimmed = override.endsWith('/') ? override.slice(0, -1) : override;
        return `${trimmed}/ws/standup?teamId=${teamId}&token=${encodedToken}`;
      }

      const apiBase = import.meta.env.VITE_API_URL;
      if (apiBase && apiBase.startsWith('http')) {
        const apiUrl = new URL(apiBase);
        const wsProtocol = apiUrl.protocol === 'https:' ? 'wss' : 'ws';
        return `${wsProtocol}://${apiUrl.host}/ws/standup?teamId=${teamId}&token=${encodedToken}`;
      }

      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const originHost = typeof window !== 'undefined' ? window.location.host : 'localhost';
      return `${isHttps ? 'wss' : 'ws'}://${originHost}/ws/standup?teamId=${teamId}&token=${encodedToken}`;
    };

    const connect = () => {
      if (cancelled) {
        return;
      }

      setSocketStatus('connecting');

      try {
        const socket = new WebSocket(resolveSocketUrl());
        socketRef.current = socket;

        socket.onopen = () => {
          setSocketStatus('connected');
          reconnectDelay = 2000;
          appendRealtimeLog('已連線到站立會議伺服器');
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);

            if (payload?.type === 'standup:session-status' && Number(payload.teamId) === Number(teamId)) {
              syncServerTime(payload.serverTimestamp);
              setParticipantStats({
                required: Number(payload.requiredParticipants) || 0,
                current: Number(payload.currentParticipants) || 0
              });
              setActiveParticipants(Array.isArray(payload.participants) ? payload.participants : []);

              if (payload.active) {
                syncServerTime(payload.serverTimestamp);
                setSessionInfo(buildSessionInfoFromPayload(payload));
                setOverdueMinutes(null);
                lastOverdueToastRef.current = null;
              } else {
                setSessionInfo(null);
                setOverdueMinutes(null);
                lastOverdueToastRef.current = null;
              }
              return;
            }

            if (payload?.type === 'standup:update' && Number(payload.teamId) === Number(teamId)) {
              const metadata = payload.metadata || {};
              setParticipantStats((prev) => ({
                required: typeof metadata.requiredParticipants === 'number'
                  ? metadata.requiredParticipants
                  : prev.required,
                current: typeof metadata.currentParticipants === 'number'
                  ? metadata.currentParticipants
                  : prev.current
              }));
              if (Array.isArray(payload.participants)) {
                setActiveParticipants(payload.participants);
              } else if (Array.isArray(metadata.participants)) {
                setActiveParticipants(metadata.participants);
              }

              let shouldRefreshData = true;

              if (payload.action === 'standup-session-started' && metadata.startTime) {
                syncServerTime(metadata.serverTimestamp);
                setSessionInfo(buildSessionInfoFromPayload(metadata));
                setOverdueMinutes(null);
                lastOverdueToastRef.current = null;
                shouldRefreshData = false;
              } else if (payload.action === 'standup-session-warning') {
                syncServerTime(metadata.serverTimestamp);
                setOverdueMinutes(
                  typeof metadata.overMinutes === 'number'
                    ? metadata.overMinutes
                    : 0
                );
                shouldRefreshData = false;
              } else if (payload.action === 'standup-participant-left' || payload.action === 'standup-participant-joined') {
                shouldRefreshData = false;
              } else if (payload.action === 'standup-session-ended') {
                syncServerTime(metadata.serverTimestamp);
                setSessionInfo(null);
                setOverdueMinutes(null);
                lastOverdueToastRef.current = null;
                showToast(
                  `${metadata.actorName || '系統'} 結束了站立會議`,
                  'warning'
                );
                shouldRefreshData = false;
              }

              appendRealtimeLog(describeRealtimeEvent(payload));

              if (shouldRefreshData) {
                loadStandupData({ silent: true });
              }
              return;
            }
          } catch (err) {
            console.error('Standup WS message parse error:', err);
          }
        };

        socket.onerror = (event) => {
          console.error('Standup WS error:', event);
          if (!cancelled) {
            appendRealtimeLog('站立會議連線發生錯誤，系統將重新嘗試。');
          }
        };

        socket.onclose = () => {
          setSocketStatus('disconnected');
          if (cancelled) {
            return;
          }
          appendRealtimeLog('站立會議連線中斷，正在嘗試重新連線...');
          reconnectTimerRef.current = window.setTimeout(() => {
            connect();
          }, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 15000);
        };
      } catch (error) {
        console.error('Standup WS connection error:', error);
        appendRealtimeLog('無法連線到站立會議伺服器，將稍後重新嘗試。');
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      }
    };

    connect();

    return () => {
      cancelled = true;
      setSocketStatus('disconnected');
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, 'component-unmount');
        } catch {
          // ignore close errors
        }
        socketRef.current = null;
      }
    };
  }, [teamId, loadStandupData]);



  const handleForceStartStandup = async () => {
    if (!teamId || forcingStart) {
      return;
    }
    setError('');
    setForcingStart(true);
    try {
      await api.forceStartStandup(teamId);
      appendRealtimeLog('已發送強制開始站立會議的請求');
    } catch (err: any) {
      console.error('Force start standup error:', err);
      setError(err.response?.data?.error || '強制開始站立會議失敗，請稍後再試');
    } finally {
      setForcingStart(false);
    }
  };

  const handleForceStopStandup = async () => {
    if (!teamId || forcingStop) {
      return;
    }
    setError('');
    setForcingStop(true);
    try {
      await api.forceStopStandup(teamId);
      showToast('站立會議已被強制結束', 'warning');
      appendRealtimeLog('已發送強制結束站立會議的請求');
    } catch (err: any) {
      console.error('Force stop standup error:', err);
      setError(err.response?.data?.error || '強制結束站立會議失敗，請稍後再試');
    } finally {
      setForcingStop(false);
    }
  };


  const handleAnalyzeWorkItems = async () => {
    // AI 需同時分析今日與未完成的所有項目
    const allItems = [...workItems, ...incompleteItems];
    
    if (allItems.length === 0) {
      setError('目前沒有可以分析的工作項目');
      return;
    }

    setAnalyzing(true);
    setError('');
    
    try {
      const result = await api.analyzeWorkItems(teamId, allItems);
      
      if (result.analysis) {
        setAnalysis(result.analysis);
        setAnalysisData(result.data);
      } else if (result.summary) {
        let analysisText = `## AI 分析建議\n\n### 重點摘要\n${result.summary}\n\n`;
        
        if (result.keyTasks && result.keyTasks.length > 0) {
          analysisText += `### 建議優先處理項目\n`;
          result.keyTasks.forEach((task: string, index: number) => {
            analysisText += `${index + 1}. ${task}\n`;
          });
        }
        
        setAnalysis(analysisText);
        setAnalysisData(result);
      } else {
        setAnalysis('AI 暫時沒有產出分析結果，請稍後再試');
        setAnalysisData(null);
      }
    } catch (err: any) {
      console.error('AI analyze error:', err);
      setError(err.response?.data?.error || 'AI 分析失敗，請稍後再試');
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
        // 優先順序高者在前
        const aPriority = a.priority ?? 3;
        const bPriority = b.priority ?? 3;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        // 同優先序時，較新的排前面
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  };

  const getUserIncompleteItems = (userId: number) => {
    return incompleteItems
      .filter(item => item.user_id === userId)
      .sort((a, b) => {
        // 優先順序高者在前
        const aPriority = a.priority ?? 3;
        const bPriority = b.priority ?? 3;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        // 同優先序時，較新的排前面
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  };

  // 使用者作為共同負責人的工作項目
  const getUserCoHandlerWorkItems = (userId: number) => {
    const coHandled = workItems.filter(
      (item) =>
        item.handlers?.co_handlers?.some((h) => h.user_id === userId) && item.user_id !== userId
    );
    return sortItems(coHandled);
  };

  const getUserCoHandlerIncompleteItems = (userId: number) => {
    const coHandled = incompleteItems.filter(
      (item) =>
        item.handlers?.co_handlers?.some((h) => h.user_id === userId) && item.user_id !== userId
    );
    return sortItems(coHandled);
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
      
      // 更新資料以反映新的指派
      await loadStandupData({ silent: true });
      
      alert('工作項目指派成功');
    } catch (err: any) {
      console.error('Reassign work item error:', err);
      const message = err.response?.data?.error || '重新指派工作項目失敗';
      setError(message);
      alert(message);
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
      await loadStandupData({ silent: true });
      setShowPriorityModal(false);
      setEditingWorkItem(null);
      alert('優先順序已更新');
    } catch (err: any) {
      console.error('Update priority error:', err);
      alert(err.response?.data?.error || '更新優先順序失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveHandlers = async () => {
    if (!editingWorkItem || !selectedPrimaryHandler) {
      alert('請先選擇主要負責人');
      return;
    }

    try {
      setLoading(true);

      const originalPrimaryId = editingWorkItem.handlers?.primary?.user_id || editingWorkItem.user_id;
      const currentCoHandlerIds = editingWorkItem.handlers?.co_handlers?.map(h => h.user_id) || [];
      
      // 1. 移除被取消勾選的共同負責人（但保留新主要負責人）
      for (const userId of currentCoHandlerIds) {
        if (!selectedCoHandlers.includes(userId) && userId !== selectedPrimaryHandler) {
          await api.removeCoHandler(editingWorkItem.id, userId);
        }
      }

      // 2. 主要負責人改變時，先重新指派
      if (selectedPrimaryHandler !== originalPrimaryId) {
        await api.reassignWorkItem(editingWorkItem.id, selectedPrimaryHandler);
      }

      // 3. 新增其他共同負責人（排除目前主要/原主要）
      for (const userId of selectedCoHandlers) {
        if (userId !== selectedPrimaryHandler && userId !== originalPrimaryId) {
          if (!currentCoHandlerIds.includes(userId)) {
            try {
              await api.addCoHandler(editingWorkItem.id, userId);
            } catch (err: any) {
              // 忽略重複共同負責人的錯誤
              console.log('Add co-handler warning:', err.response?.data?.error);
              if (!err.response?.data?.error?.includes('已存在共同負責人')) {
                throw err;
              }
            }
          }
        }
      }

      // 更新資料以反映新的負責人設定
      await loadStandupData({ silent: true });
      setShowHandlerModal(false);
      setEditingWorkItem(null);
      alert('負責成員已更新');
    } catch (err: any) {
      console.error('Save handlers error:', err);
      alert(err.response?.data?.error || '更新負責成員失敗');
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

  // 從協辦卡片跳回原始卡片並高亮
  const scrollToOriginalItem = (workItemId: number, primaryUserId: number) => {
    // 展開主要負責人的區塊
    const newExpanded = new Set(expandedMembers);
    newExpanded.add(primaryUserId);
    setExpandedMembers(newExpanded);
    
    // 展開該工作項目卡片
    const newExpandedItems = new Set(expandedWorkItems);
    newExpandedItems.add(workItemId);
    setExpandedWorkItems(newExpandedItems);
    
    // 確保未完成區塊保持展開
    setShowIncompleteItems(true);
    
    // 捲動並暫時高亮原始卡片
    setTimeout(() => {
      const element = document.getElementById(`work-item-${workItemId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 短暫高亮提示
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

  const targetParticipantCount =
    sessionInfo?.requiredParticipants ||
    participantStats.required ||
    teamMembers.length ||
    participantStats.current ||
    activeParticipants.length ||
    0;
  const outstandingParticipants = Math.max(targetParticipantCount - activeParticipants.length, 0);
  const hasParticipantData = targetParticipantCount > 0 || activeParticipants.length > 0;
  const hasAutoStartWarning =
    !sessionInfo && participantStats.required > 0 && participantStats.current < participantStats.required;
  const autoStartWarning = hasAutoStartWarning
    ? `目前僅 ${participantStats.current}/${participantStats.required} 人到齊，尚未達到自動開始條件`
    : '';
  const shouldShowFloatingPanel =
    hasParticipantData ||
    hasAutoStartWarning ||
    connectionLogs.length > 0 ||
    !!sessionInfo ||
    participantStats.required > 0 ||
    forcingStart ||
    forcingStop;
  const panelOffset = participantPanelMinimized ? 110 : participantPanelCollapsed ? 260 : 420;
  const mainContentStyle = {
    paddingBottom:
      participantPanelPosition === 'bottom' && shouldShowFloatingPanel ? `${panelOffset}px` : undefined,
    paddingTop:
      participantPanelPosition === 'top' && shouldShowFloatingPanel ? `${panelOffset}px` : undefined
  };

  const participantPanel = shouldShowFloatingPanel ? (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        width: participantPanelMinimized ? 'min(420px, calc(100% - 32px))' : 'min(720px, calc(100% - 32px))',
        backgroundColor: '#eef2ff',
        border: '1px solid #c7d2fe',
        borderRadius: participantPanelMinimized ? '999px' : '16px',
        padding: participantPanelMinimized ? '10px 16px' : '18px',
        boxShadow: '0 30px 55px rgba(79, 70, 229, 0.18)',
        zIndex: 1040,
        ...(participantPanelPosition === 'bottom' ? { bottom: '20px' } : { top: '20px' })
      }}
    >
      {participantPanelMinimized ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap',
            position: 'relative'
          }}
        >
          {sessionInfo && (
            <div
              style={{
                position: 'absolute',
                left: '-60px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                color: isCountdownPositive ? '#2563eb' : '#dc2626',
                backgroundColor: isCountdownPositive ? '#e0f2fe' : '#fee2e2',
                borderRadius: '999px',
                padding: '4px 10px',
                fontWeight: 600,
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)'
              }}
            >
              <Clock size={12} />
              {formatCountdown(countdownMs)}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600, color: '#1e1b4b', fontSize: '14px' }}>
              {hasParticipantData
                ? `在線 ${activeParticipants.length}/${targetParticipantCount}`
                : '站立會議監控面板'}
            </div>
            <div style={{ fontSize: '12px', color: '#4338ca' }}>
              {autoStartWarning || `連線狀態：${socketStatusLabel}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '12px' }}
              onClick={() =>
                setParticipantPanelPosition((prev) => (prev === 'bottom' ? 'top' : 'bottom'))
              }
            >
              {participantPanelPosition === 'bottom' ? '置頂' : '置底'}
            </button>
            <button
              className="btn btn-primary"
              style={{ padding: '4px 12px', fontSize: '12px' }}
              onClick={() => setParticipantPanelMinimized(false)}
            >
              展開資訊
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  backgroundColor: '#c7d2fe',
                  width: '44px',
                  height: '44px',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4338ca'
                }}
              >
                <Users size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1e1b4b', fontSize: '15px' }}>
                  {hasParticipantData
                    ? `目前 ${activeParticipants.length}/${targetParticipantCount} 人在線`
                    : '等待團隊成員加入'}
                </div>
                <div style={{ fontSize: '12px', color: '#4338ca' }}>
                  {hasParticipantData ? (
                    outstandingParticipants > 0
                      ? `尚需 ${outstandingParticipants} 人即可自動開始`
                      : '已達成自動啟動條件'
                  ) : (
                    '尚未有成員連線到站立會議'
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() =>
                  setParticipantPanelPosition((prev) => (prev === 'bottom' ? 'top' : 'bottom'))
                }
              >
                <ArrowUpDown size={14} />
                {participantPanelPosition === 'bottom' ? '置頂' : '置底'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setParticipantPanelCollapsed((prev) => !prev)}
              >
                {participantPanelCollapsed ? (
                  <>
                    展開列表
                    <ChevronDown size={14} />
                  </>
                ) : (
                  <>
                    收合列表
                    <ChevronUp size={14} />
                  </>
                )}
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setParticipantPanelMinimized(true)}
              >
                最小化
              </button>
            </div>
          </div>
          {autoStartWarning && (
            <div
              style={{
                marginTop: '10px',
                backgroundColor: '#fff7ed',
                border: '1px solid #fdba74',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '12px',
                color: '#9a3412'
              }}
            >
              {autoStartWarning}
            </div>
          )}
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              borderRadius: '12px',
              backgroundColor: '#fff',
              border: '1px solid #e0e7ff',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '12px',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  display: 'inline-block',
                  backgroundColor: socketStatusColor
                }}
              />
              <span style={{ color: '#1e1b4b' }}>
                連線狀態：{socketStatusLabel}
                {lastRealtimeEvent && lastRealtimeTimestamp
                  ? ` · ${lastRealtimeTimestamp} ${lastRealtimeEvent}`
                  : ''}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!sessionInfo && (
                <button className="btn btn-primary" onClick={handleForceStartStandup} disabled={forcingStart}>
                  {forcingStart ? '處理中...' : '強制開始'}
                </button>
              )}
              {sessionInfo && (
                <button className="btn btn-danger" onClick={handleForceStopStandup} disabled={forcingStop}>
                  {forcingStop ? '結束中...' : '強制結束'}
                </button>
              )}
            </div>
          </div>
          {sessionInfo && (
            <div
              style={{
                marginTop: '12px',
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: '#eef2ff',
                border: '1px solid #d4dcff'
              }}
            >
              <div style={{ fontSize: '14px', color: '#312e81', marginBottom: '6px', fontWeight: 600 }}>
                站立會議計時
              </div>
              <div
                style={{
                  fontSize: '32px',
                  fontWeight: 700,
                  color: isCountdownPositive ? '#0ea5e9' : '#dc2626'
                }}
              >
                {formatCountdown(countdownMs)}
              </div>
              <div style={{ fontSize: '13px', color: '#4338ca', marginTop: '6px' }}>
                由 {sessionInfo.startedBy || '系統'} 發起，時長 15 分鐘
              </div>
              <div style={{ fontSize: '13px', color: '#4338ca' }}>
                出席人數：{participantStats.current}/
                {sessionInfo.requiredParticipants || participantStats.required || participantStats.current}
              </div>
              {isCountdownExpired && (
                <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '13px' }}>
                  已超過預定時間，請盡速進入結尾
                </div>
              )}
            </div>
          )}
          {!participantPanelCollapsed && (
            <>
              <div style={{ marginTop: '12px', maxHeight: '160px', overflowY: 'auto' }}>
                {activeParticipants.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#4c1d95', margin: 0 }}>
                    目前尚無成員連線，等待同仁加入中。
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '8px'
                    }}
                  >
                    {activeParticipants.map((participant) => (
                      <div
                        key={participant.userId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          borderRadius: '10px',
                          border: '1px solid #e0e7ff',
                          backgroundColor: '#fff'
                        }}
                      >
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: '#eef2ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            color: '#4338ca',
                            fontSize: '12px'
                          }}
                        >
                          {getParticipantInitials(participant)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#1e1b4b', fontSize: '13px' }}>
                            {getParticipantDisplayName(participant)}
                          </div>
                          <div style={{ fontSize: '12px', color: '#4338ca' }}>線上</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginTop: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px'
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '14px', color: '#312e81' }}>站立會議即時紀錄</h3>
                  <button
                    className="btn btn-secondary"
                    onClick={clearConnectionLogs}
                    disabled={connectionLogs.length === 0}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                  >
                    清除紀錄
                  </button>
                </div>
                <div
                  style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    backgroundColor: '#f5f3ff'
                  }}
                >
                  {connectionLogs.length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#7c3aed', margin: 0 }}>
                      目前尚無任何連線或操作紀錄。當成員加入、離開或更新資訊時，會顯示在這裡。
                    </p>
                  ) : (
                    connectionLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          gap: '12px',
                          padding: '6px 0',
                          borderBottom: '1px dashed #ddd6fe'
                        }}
                      >
                        <span style={{ fontSize: '11px', color: '#7c3aed', minWidth: '110px' }}>
                          {log.timestamp}
                        </span>
                        <span style={{ fontSize: '12px', color: '#1f2937', flex: 1 }}>{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  ) : null;

  const toastStack = toasts.length > 0 ? (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1050,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            backgroundColor: toast.variant === 'warning' ? '#fee2e2' : '#dbeafe',
            color: toast.variant === 'warning' ? '#b91c1c' : '#1d4ed8',
            padding: '10px 14px',
            borderRadius: '6px',
            minWidth: '240px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="app-container">
        <div className="main-content" style={mainContentStyle}>
          {toastStack}
          <Breadcrumbs />
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
      <div className="main-content" style={mainContentStyle}>
        {toastStack}
        <Breadcrumbs />
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={18} />
          返回儀表板
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
                小提示：點擊外部或按下 ESC 可以關閉視窗
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1>站立會議檢閱</h1>
            <p className="subtitle">即時掌握團隊打卡與工作進度，並透過 AI 提供建議</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => loadStandupData()}
              disabled={loading}
              title="重新取得最新資料"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  載入中...
                </>
              ) : (
                '重新整理'
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
                  AI 建議
                </>
              )}
            </button>
          </div>
        </div>
        {typeof overdueMinutes === 'number' && (
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            <AlertCircle size={18} />
            {overdueMinutes === 0
              ? '站立會議已達 15 分鐘，請開始收斂討論。'
              : `站立會議已超過 ${overdueMinutes} 分鐘，請儘速結束。`}
          </div>
        )}



        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {/* 指標卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#e3f2fd' }}>
              <Users size={24} style={{ color: '#0066cc' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">團隊成員</div>
              <div className="stat-value">{teamMembers.length}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#e8f5e9' }}>
              <CheckCircle size={24} style={{ color: '#4caf50' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">今日打卡</div>
              <div className="stat-value">{checkins.length}</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#fff3e0' }}>
              <Clock size={24} style={{ color: '#ff9800' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">今日打卡率</div>
              <div className="stat-value">{checkinRate}%</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon" style={{ backgroundColor: '#f3e5f5' }}>
              <TrendingUp size={24} style={{ color: '#9c27b0' }} />
            </div>
            <div className="stat-content">
              <div className="stat-label">今日工作數</div>
              <div className="stat-value">{workItems.length}</div>
            </div>
          </div>
          
          {incompleteItems.length > 0 && (
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: '#fff3e0' }}>
                <AlertCircle size={24} style={{ color: '#f59e0b' }} />
              </div>
              <div className="stat-content">
                <div className="stat-label">未完成工作</div>
                <div className="stat-value">{incompleteItems.length}</div>
              </div>
            </div>
          )}
        </div>

        {/* AI 分析 */}
        {analysis && (
          <div className="card" style={{ marginBottom: '20px', backgroundColor: '#f0f8ff', borderLeft: '4px solid #0066cc' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
              <Sparkles size={20} style={{ color: '#0066cc' }} />
              AI 分析建議
            </h3>
            <div className="markdown-content" style={{ fontSize: '14px', lineHeight: '1.8' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
            </div>
            
            {/* AI 建議的重新分配 */}
            {analysisData?.redistributionSuggestions && analysisData.redistributionSuggestions.length > 0 && (
              <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #d0e8ff' }}>
                <h4 style={{ fontSize: '15px', marginBottom: '12px', color: '#0066cc' }}>
                  建議的工作重新分配
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analysisData.redistributionSuggestions.map((suggestion: any, index: number) => {
                    // 從建議裡找出來源/目標成員
                    const fromMember = teamMembers.find(m => 
                      (m.display_name || m.username).includes(suggestion.from) || 
                      suggestion.from.includes(m.display_name || m.username)
                    );
                    const toMember = teamMembers.find(m => 
                      (m.display_name || m.username).includes(suggestion.to) || 
                      suggestion.to.includes(m.display_name || m.username)
                    );
                    
                    if (!fromMember || !toMember) return null;
                    
                    // 盡量找到來源成員對應的原始工作卡
                    const workItem = workItems.find(item => 
                      item.user_id === fromMember.user_id && 
                      (item.ai_title?.includes(suggestion.task) || item.content.includes(suggestion.task))
                    );
                    
                    if (!workItem) return null;
                    
                    // 以建議的優先序為主，若無則沿用原始卡
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
                            建議由 <strong>{suggestion.from}</strong> 調整給 <strong>{suggestion.to}</strong>
                          </div>
                          {suggestion.reason && (
                            <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
                              理由：{suggestion.reason}
                            </div>
                          )}
                          {workItem.handlers?.co_handlers && workItem.handlers.co_handlers.length > 0 && (
                            <div style={{ fontSize: '11px', color: '#0066cc', marginTop: '4px' }}>
                              目前已有 {workItem.handlers.co_handlers.length} 位共同負責人
                            </div>
                          )}
                        </div>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '13px', padding: '6px 12px' }}
                          onClick={async () => {
                            if (window.confirm(`確定將「${suggestion.task}」改由 ${suggestion.to} 處理嗎？`)) {
                              await handleAssignWorkItem(workItem.id, toMember.user_id);
                            }
                          }}
                        >
                          套用建議
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 今日打卡與進度 */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>今日打卡總覽</h3>
            <div style={{ fontSize: '13px', color: '#666' }}>
              已打卡 <strong style={{ color: '#4caf50' }}>{checkins.length}</strong> / 
              未打卡 <strong style={{ color: '#999' }}>{teamMembers.length - checkins.length}</strong>
            </div>
          </div>
          {teamMembers.length === 0 ? (
            <p style={{ color: '#666', marginTop: '15px' }}>尚未建立任何團隊成員</p>
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

                    {/* Member work items */}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 500, color: '#666' }}>
                                今日工作項目 ({memberWorkItems.length})
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSortBy(sortBy === 'priority' ? 'estimated_date' : 'priority');
                                }}
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '11px',
                                  borderRadius: '3px',
                                  border: '1px solid #7c3aed',
                                  backgroundColor: '#7c3aed',
                                  color: '#fff',
                                  cursor: 'pointer'
                                }}
                                title="切換排序方式"
                              >
                                {sortBy === 'priority' ? '優先順序' : '預計時間'}
                              </button>
                            </div>
                            {expandedMembers.has(member.user_id) ? (
                              <ChevronUp size={16} style={{ color: '#666' }} />
                            ) : (
                              <ChevronDown size={16} style={{ color: '#666' }} />
                            )}
                          </div>
                          {expandedMembers.has(member.user_id) && (
                          <div style={{ marginTop: '8px' }}>
                            {sortItems(memberWorkItems).map((item: WorkItem) => {
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
                                      <span style={{ fontSize: '11px', color: item.estimated_date ? '#0891b2' : '#999' }}>
                                        📅 預計時間：
                                        {item.estimated_date 
                                          ? (() => {
                                              const dateStr = typeof item.estimated_date === 'string' && item.estimated_date.includes('T') 
                                                ? item.estimated_date.split('T')[0] 
                                                : item.estimated_date;
                                              const [year, month, day] = dateStr.split('-');
                                              return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
                                            })()
                                          : '未設定'}
                                      </span>
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
                                          title="調整優先順序"
                                        >
                                          調整優先
                                        </button>
                                        <button
                                          className="btn btn-secondary"
                                          style={{ fontSize: '11px', padding: '4px 8px' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openHandlerModal(item);
                                          }}
                                          title="管理共同負責人"
                                        >
                                          <UserPlus size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Expanded Content */}
                                  {isItemExpanded && (
                                    <div style={{ padding: '0 10px 10px 10px', borderTop: '1px solid #e5e7eb' }}>
                                      {/* 預計處理時間 */}
                                      <div style={{ marginTop: '8px', marginBottom: '8px' }}>
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
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            e.currentTarget.showPicker && e.currentTarget.showPicker();
                                          }}
                                          onChange={async (e) => {
                                            e.stopPropagation();
                                            try {
                                              // 將日期以 YYYY-MM-DD 格式回傳給 API
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
                                                alert(error.error || '更新預計時間失敗，請稍後再試');
                                                return;
                                              }
                                              await loadStandupData({ silent: true });
                                            } catch (error) {
                                              console.error('更新預計時間失敗:', error);
                                              alert('更新預計時間失敗，請稍後再試');
                                            }
                                          }}
                                          style={{ maxWidth: '200px' }}
                                        />
                                      </div>
                                      {/* 負責人資訊 */}
                                      <div style={{ marginTop: '8px', marginBottom: '8px', fontSize: '13px' }}>
                                        <div style={{ marginBottom: '4px' }}>
                                          <strong style={{ color: '#667eea' }}>主要負責人</strong>
                                          {item.handlers?.primary ? (
                                            <span style={{ marginLeft: '4px' }}>
                                              {item.handlers.primary.display_name || item.handlers.primary.username}
                                            </span>
                                          ) : (
                                            <span style={{ marginLeft: '4px', color: '#999' }}>尚未指派</span>
                                          )}
                                        </div>
                                        {item.handlers?.co_handlers && item.handlers.co_handlers.length > 0 && (
                                          <div>
                                            <strong style={{ color: '#667eea' }}>共同負責人</strong>
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
                                            <span style={{ fontSize: '11px', fontWeight: '600', color: '#7c3aed' }}>AI 建議</span>
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
                          尚未建立今日工作項目
                        </div>
                      )}
                      
                      {/* Member incomplete items */}
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
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowIncompleteItems(!showIncompleteItems);
                              }}
                            >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#92400e' }}>
                                      未完成工作 ({memberIncompleteItems.length})
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSortBy(sortBy === 'priority' ? 'estimated_date' : 'priority');
                                      }}
                                      style={{
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        borderRadius: '3px',
                                        border: '1px solid #f59e0b',
                                        backgroundColor: '#f59e0b',
                                        color: '#fff',
                                        cursor: 'pointer'
                                      }}
                                      title="切換排序方式"
                                    >
                                      {sortBy === 'priority' ? '優先順序' : '預計時間'}
                                    </button>
                                  </div>
                                  {showIncompleteItems ? (
                                    <ChevronUp size={16} style={{ color: '#92400e' }} />
                                  ) : (
                                    <ChevronDown size={16} style={{ color: '#92400e' }} />
                                  )}
                                </div>
                                {showIncompleteItems && (
                                  <div style={{ marginTop: '8px' }}>
                                    {sortItems(memberIncompleteItems).map((item: WorkItem) => {
                                      const isItemExpanded = expandedWorkItems.has(item.id);
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
                                              <span style={{ fontSize: '11px', color: item.estimated_date ? '#0891b2' : '#999' }}>
                                                📅 預計時間：
                                                {item.estimated_date 
                                                  ? (() => {
                                                      const dateStr = typeof item.estimated_date === 'string' && item.estimated_date.includes('T') 
                                                        ? item.estimated_date.split('T')[0] 
                                                        : item.estimated_date;
                                                      const [year, month, day] = dateStr.split('-');
                                                      return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
                                                    })()
                                                  : '未設定'}
                                              </span>
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
                                            <div className="reassign-area" style={{ display: 'flex', gap: '4px' }}>
                                              <button
                                                className="btn btn-secondary"
                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openPriorityModal(item);
                                                }}
                                                title="調整優先順序"
                                              >
                                                調整優先
                                              </button>
                                              <button
                                                className="btn btn-secondary"
                                                style={{ fontSize: '11px', padding: '4px 8px' }}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openHandlerModal(item);
                                                }}
                                                title="管理共同負責人"
                                              >
                                                <UserPlus size={12} />
                                              </button>
                                            </div>
                                          </div>
                                          
                                          {isItemExpanded && (
                                            <div style={{ padding: '0 10px 10px 10px', borderTop: '1px solid #fef3c7' }}>
                                              {/* 預計處理時間 */}
                                              <div style={{ marginTop: '8px', marginBottom: '8px' }}>
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
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.currentTarget.showPicker && e.currentTarget.showPicker();
                                                  }}
                                                  onChange={async (e) => {
                                                    e.stopPropagation();
                                                try {
                                                      // 將日期以 YYYY-MM-DD 格式回傳給 API
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
                                                alert(error.error || '更新預計時間失敗，請稍後再試');
                                                return;
                                              }
                                              await loadStandupData({ silent: true });
                                            } catch (error) {
                                              console.error('更新預計時間失敗:', error);
                                              alert('更新預計時間失敗，請稍後再試');
                                            }
                                          }}
                                                  style={{ maxWidth: '200px' }}
                                                />
                                              </div>
                                              {/* 負責人資訊 */}
                                              <div style={{ marginTop: '8px', marginBottom: '8px', fontSize: '13px' }}>
                                                <div style={{ marginBottom: '4px' }}>
                                                  <strong style={{ color: '#f59e0b' }}>主要負責人</strong>
                                                  {item.handlers?.primary ? (
                                                    <span style={{ marginLeft: '4px' }}>
                                                      {item.handlers.primary.display_name || item.handlers.primary.username}
                                                    </span>
                                                  ) : (
                                                    <span style={{ marginLeft: '4px', color: '#999' }}>尚未指派</span>
                                                  )}
                                                </div>
                                                {item.handlers?.co_handlers && item.handlers.co_handlers.length > 0 && (
                                                  <div>
                                                    <strong style={{ color: '#f59e0b' }}>共同負責人</strong>
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
                                                    <span style={{ fontSize: '11px', fontWeight: '600', color: '#f59e0b' }}>AI 建議</span>
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
                          
                          {/* Co-handler items */}
                          {(() => {
                            const coHandlerTodayItems = getUserCoHandlerWorkItems(member.user_id);
                            const coHandlerIncompleteItems = getUserCoHandlerIncompleteItems(member.user_id);
                            const totalCoHandlerItems = coHandlerTodayItems.length + coHandlerIncompleteItems.length;
                            
                            if (totalCoHandlerItems === 0) return null;
                            
                            // 使用負的虛擬 ID，避免與實際 work item id 衝突
                            const coHandlerExpandId = -(member.user_id * 1000);
                            
                            return (
                              <>
                                <div
                                  role="button"
                                  tabIndex={0}
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
                                    border: '1px solid #bfdbfe',
                                    width: '100%',
                                    textAlign: 'left',
                                    outline: 'none'
                                  }}
                                  onClick={(e) => {
                                    stopEvent(e);
                                    const newExpanded = new Set(expandedWorkItems);
                                    if (newExpanded.has(coHandlerExpandId)) {
                                      newExpanded.delete(coHandlerExpandId);
                                    } else {
                                      newExpanded.add(coHandlerExpandId);
                                    }
                                    setExpandedWorkItems(newExpanded);
                                  }}
                                  onMouseDown={(e) => {
                                    stopEvent(e);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      stopEvent(e);
                                      const newExpanded = new Set(expandedWorkItems);
                                      if (newExpanded.has(coHandlerExpandId)) {
                                        newExpanded.delete(coHandlerExpandId);
                                      } else {
                                        newExpanded.add(coHandlerExpandId);
                                      }
                                      setExpandedWorkItems(newExpanded);
                                    }
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {expandedWorkItems.has(coHandlerExpandId) ? 
                                      <ChevronUp size={16} style={{ color: '#0066cc' }} /> : 
                                      <ChevronDown size={16} style={{ color: '#0066cc' }} />
                                    }
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#0066cc' }}>
                                      共同負責項目
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#0066cc', backgroundColor: '#dbeafe', padding: '2px 6px', borderRadius: '10px' }}>
                                      {totalCoHandlerItems}
                                    </span>
                                  </div>
                                </div>
                                
                                {expandedWorkItems.has(coHandlerExpandId) && (
                                  <div style={{ paddingLeft: '10px', marginBottom: '10px' }}>
                                    {/* 今日協辦任務 */}
                                    {coHandlerTodayItems.length > 0 && (
                                      <div style={{ marginBottom: '8px' }}>
                                        <div style={{ fontSize: '12px', color: '#0066cc', marginBottom: '6px', fontWeight: '600' }}>
                                          今日協辦任務 ({coHandlerTodayItems.length})
                                        </div>
                                        {coHandlerTodayItems.map((item) => {
                                        // 給協辦卡片獨立的展開 key，避免與主卡重複
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
                                                  stopEvent(e);
                                                  const newExpanded = new Set(expandedWorkItems);
                                                  if (isItemExpanded) {
                                                    newExpanded.delete(coHandlerExpandKey);
                                                  } else {
                                                    newExpanded.add(coHandlerExpandKey);
                                                  }
                                                  // 更新共同負責卡片的展開狀態
                                                  setExpandedWorkItems(newExpanded);
                                                }}
                                              >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                                  {isItemExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                  <div style={{ fontSize: '13px' }}>
                                                    {item.ai_title || item.content}
                                                  </div>
                                                  {renderItemMetaBadges(item)}
                                                </div>
                                                <button
                                                  className="jump-to-original"
                                                  type="button"
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
                                                  title="檢視原始項目"
                                                >
                                                  前往原卡片
                                                </button>
                                              </div>
                                              
                                              {isItemExpanded && (
                                                <div style={{ padding: '8px 0 0 20px', borderTop: '1px solid #e5e7eb', marginTop: '6px' }}>
                                                  {/* 負責人摘要 */}
                                                  <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                                                    <div style={{ marginBottom: '4px', color: '#0066cc' }}>
                                                      <strong>主要負責人</strong>
                                                      <span style={{ marginLeft: '4px' }}>
                                                        {primaryUser?.display_name || primaryUser?.username || '尚未指派'}
                                                      </span>
                                                    </div>
                                                    {otherCoHandlers.length > 0 && (
                                                      <div style={{ color: '#0066cc' }}>
                                                        <strong>其他共同負責人</strong>
                                                        <span style={{ marginLeft: '4px' }}>
                                                          {otherCoHandlers.map((h: any) => h.display_name || h.username).join(', ')}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                  {/* 項目內容 */}
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
                                    
                                    {/* 未完成的協辦項目 */}
                                    {coHandlerIncompleteItems.length > 0 && (
                                      <div>
                                        <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '6px', fontWeight: '600' }}>
                                          未完成協辦任務 ({coHandlerIncompleteItems.length})
                                        </div>
                                        {coHandlerIncompleteItems.map((item: WorkItem) => {
                                          // 為共同負責的卡片建立獨立的展開 key，避免與主卡衝突
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
                                                  stopEvent(e);
                                                  const newExpanded = new Set(expandedWorkItems);
                                                  if (isItemExpanded) {
                                                    newExpanded.delete(coHandlerExpandKey);
                                                  } else {
                                                    newExpanded.add(coHandlerExpandKey);
                                                  }
                                                  // 更新共同負責卡片的展開狀態
                                                  setExpandedWorkItems(newExpanded);
                                                }}
                                              >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                                  {isItemExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                  <div style={{ fontSize: '13px' }}>
                                                    {item.ai_title || item.content}
                                                  </div>
                                                  {renderItemMetaBadges(item, '#0891b2')}
                                                </div>
                                                <button
                                                  className="jump-to-original"
                                                  type="button"
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
                                                  title="檢視原始項目"
                                                >
                                                  前往原卡片
                                                </button>
                                              </div>
                                              
                                              {isItemExpanded && (
                                                <div style={{ padding: '8px 0 0 20px', borderTop: '1px solid #fef3c7', marginTop: '6px' }}>
                                                  {/* 負責人摘要 */}
                                                  <div style={{ marginBottom: '8px', fontSize: '12px' }}>
                                                    <div style={{ marginBottom: '4px', color: '#f59e0b' }}>
                                                      <strong>主要負責人</strong>
                                                      <span style={{ marginLeft: '4px' }}>
                                                        {primaryUser?.display_name || primaryUser?.username || '尚未指派'}
                                                      </span>
                                                    </div>
                                                    {otherCoHandlers.length > 0 && (
                                                      <div style={{ color: '#f59e0b' }}>
                                                        <strong>其他共同負責人</strong>
                                                        <span style={{ marginLeft: '4px' }}>
                                                          {otherCoHandlers.map((h: any) => h.display_name || h.username).join(', ')}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>
                                                  {/* 項目內容 */}
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

        {/* 協作說明 */}
        <div className="card" style={{ marginTop: '20px', backgroundColor: '#f8f9fa' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>協作小提醒</h3>
          <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', margin: 0, color: '#666' }}>
            <li><strong style={{ color: '#0f172a' }}>會前先把 Backlog 拉入今日清單</strong>，站立會議能直接逐項檢閱。</li>
            <li>AI 建議有再分配/優先序調整時，點按<strong style={{ color: '#2563eb' }}>「套用建議」</strong>即可快速重新指派。</li>
            <li>共同負責人可在展開卡片後管理，協辦卡可透過<strong style={{ color: '#2563eb' }}>「前往原卡片」</strong>對齊資訊。</li>
            <li>計時到 15 分鐘會提醒，超時請<strong style={{ color: '#b91c1c' }}>盡快收斂</strong>，詳細討論可在會後進行。</li>
          </ul>
        </div>

        {/* 主要負責人設定 Modal */}
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
                調整負責人：{editingWorkItem.ai_title || editingWorkItem.content.substring(0, 30) + '...'}
              </h3>

              {/* 主要負責人 */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: '#333'
                }}>
                  主要負責人
                </label>
                <select
                  className="input"
                  value={selectedPrimaryHandler || ''}
                  onChange={(e) => setSelectedPrimaryHandler(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                >
                  <option value="">請選擇主要負責人</option>
                  {teamMembers.map(member => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name || member.username}
                    </option>
                  ))}
                </select>
              </div>

              {/* 共同負責人 */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: '#333'
                }}>
                  共同負責人（可複選）
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
                      暫無可選的共同負責人
                    </div>
                  )}
                </div>
              </div>

              {/* 按鈕群組 */}
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

        {/* 優先順序 Modal */}
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
                調整優先順序：{editingWorkItem.ai_title || editingWorkItem.content.substring(0, 30) + '...'}
              </h3>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: 'bold',
                  fontSize: '14px',
                  color: '#333'
                }}>
                  優先順序
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

              {/* 按鈕群組 */}
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
      {participantPanel}
    </div>
  );
}

export default StandupReview;



