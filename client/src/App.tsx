import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import 'katex/dist/katex.min.css';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TeamSelect from './pages/TeamSelect';
import Checkin from './pages/Checkin';
import WorkItems from './pages/WorkItems';
import Backlog from './pages/Backlog';
import StandupReview from './pages/StandupReview';
import UpdateWork from './pages/UpdateWork';
import DailySummary from './pages/DailySummary';
import TeamManagement from './pages/TeamManagement';
import { WeeklyReports } from './pages';
import CompletedHistory from './pages/CompletedHistory';
import api from './services/api';
import { buildLoginRedirectPath, sanitizeRedirectPath } from './utils/redirect';
import { clearStoredSelectedTeam, getStoredSelectedTeam, storeSelectedTeam, withTeamQuery } from './utils/teamSelection';
import './App.css';

interface User {
  id: number;
  username: string;
  displayName: string;
  email?: string;
}

interface TeamAccessState {
  allowedTeamIds: number[];
  loading: boolean;
  loaded: boolean;
  error: string;
}

interface AppRoutesProps {
  user: User | null;
  selectedTeam: number | null;
  onSelectTeam: (teamId: number | null) => void;
  onLogin: (userData: User, token: string) => void;
  onLogout: () => void;
  teamAccess: TeamAccessState;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const teamFromUrl = params.get('teamId');
    if (teamFromUrl && !Number.isNaN(Number(teamFromUrl))) {
      return Number(teamFromUrl);
    }
    const { teamId } = getStoredSelectedTeam();
    return teamId;
  });
  const [teamAccessState, setTeamAccessState] = useState<TeamAccessState>({
    allowedTeamIds: [],
    loading: false,
    loaded: false,
    error: ''
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!user) {
      setTeamAccessState({
        allowedTeamIds: [],
        loading: false,
        loaded: false,
        error: ''
      });
      return;
    }

    let cancelled = false;
    setTeamAccessState((prev) => ({ ...prev, loading: true, error: '' }));

    const loadTeams = async () => {
      try {
        const teams = await api.getTeams();
        if (cancelled) return;
        const allowedIds = Array.isArray(teams) ? teams.map((team: any) => team.id) : [];
        setTeamAccessState({
          allowedTeamIds: allowedIds,
          loading: false,
          loaded: true,
          error: ''
        });
        setSelectedTeam((prev) => {
          if (prev !== null && !allowedIds.includes(prev)) {
            clearStoredSelectedTeam();
            return null;
          }
          return prev;
        });
      } catch (error: any) {
        if (cancelled) return;
        const message = error?.response?.data?.error || '載入團隊資訊失敗';
        setTeamAccessState((prev) => ({
          ...prev,
          loading: false,
          error: message
        }));
      }
    };

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const applyStoredTeamForUser = (nextUser: User) => {
    const { teamId, ownerId } = getStoredSelectedTeam();
    const hasTeamInUrl =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('teamId');

    if (teamId === null) {
      if (ownerId && ownerId !== nextUser.id) {
        clearStoredSelectedTeam();
      }
      return;
    }

    if (ownerId === nextUser.id) {
      if (!hasTeamInUrl) {
        setSelectedTeam(teamId);
      }
      return;
    }

    clearStoredSelectedTeam();
    setSelectedTeam(null);
  };

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await api.verifyToken();
        if (response.valid) {
          setUser(response.user);
          applyStoredTeamForUser(response.user);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setSelectedTeam(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (userData: User, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    applyStoredTeamForUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('postLoginRedirect');
    sessionStorage.removeItem('postTeamRedirect');
    setUser(null);
    setSelectedTeam(null);
  };

  if (loading) {
    return (
      <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="loading" style={{ width: 40, height: 40 }}></div>
      </div>
    );
  }

  return (
    <Router>
      <AppRoutes
        user={user}
        selectedTeam={selectedTeam}
        onSelectTeam={setSelectedTeam}
        onLogin={handleLogin}
        onLogout={handleLogout}
        teamAccess={teamAccessState}
      />
    </Router>
  );
}

function AppRoutes({ user, selectedTeam, onSelectTeam, onLogin, onLogout, teamAccess }: AppRoutesProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentFullPath = `${location.pathname}${location.search}${location.hash}`;
  const teamParamInfo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get('teamId');
    if (!raw) {
      return { hasParam: false, isValid: false, value: null as number | null };
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      return { hasParam: true, isValid: false, value: null as number | null };
    }
    return { hasParam: true, isValid: true, value: parsed };
  }, [location.search]);
  const { hasParam: hasTeamParam, isValid: isTeamParamValid, value: requestedTeamId } = teamParamInfo;
  const isTeamSyncingSelection = Boolean(
    user &&
      hasTeamParam &&
      isTeamParamValid &&
      (!teamAccess.loaded || selectedTeam !== requestedTeamId)
  );

  useEffect(() => {
    if (!user) return;
    if (!hasTeamParam) return;

    if (!isTeamParamValid) {
      const params = new URLSearchParams(location.search);
      params.delete('teamId');
      const sanitized = `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}${location.hash}`;
      if (sanitized !== currentFullPath) {
        navigate(sanitized, { replace: true });
      }
      return;
    }

    if (!teamAccess.loaded) {
      return;
    }

    const parsed = requestedTeamId as number;
    const hasAccess = teamAccess.allowedTeamIds.includes(parsed);
    if (!hasAccess) {
      alert('您沒有權限查看此團隊，請重新選擇。');
      const params = new URLSearchParams(location.search);
      params.delete('teamId');
      const sanitized = `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}${location.hash}`;
      if (sanitized !== currentFullPath) {
        navigate(sanitized, { replace: true });
      }
      clearStoredSelectedTeam();
      onSelectTeam(null);
      return;
    }
    if (selectedTeam !== parsed) {
      onSelectTeam(parsed);
      storeSelectedTeam(parsed, user?.id);
    }
  }, [
    hasTeamParam,
    isTeamParamValid,
    requestedTeamId,
    teamAccess.allowedTeamIds,
    teamAccess.loaded,
    selectedTeam,
    onSelectTeam,
    user?.id,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    currentFullPath
  ]);

  useEffect(() => {
    if (!user || !selectedTeam) {
      return;
    }
    if (location.pathname === '/login' || location.pathname === '/teams') {
      return;
    }
    const params = new URLSearchParams(location.search);
    const currentTeam = params.get('teamId');
    if (currentTeam === String(selectedTeam)) {
      return;
    }
    const next = withTeamQuery(currentFullPath, selectedTeam);
    navigate(next, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, selectedTeam, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const scrollOptions: ScrollToOptions = { top: 0, behavior: 'smooth' };
    window.scrollTo(scrollOptions);
    const containers = document.querySelectorAll('.app-container, .main-content');
    containers.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.scrollTo(scrollOptions);
      }
    });
  }, [location.pathname, location.search]);

  const RequireAccess = ({
    render,
    requireTeam = true
  }: {
    render: () => JSX.Element;
    requireTeam?: boolean;
  }) => {
    const targetPath = currentFullPath;

    if (!user) {
      sessionStorage.setItem('postLoginRedirect', targetPath);
      return <Navigate to={buildLoginRedirectPath(targetPath)} state={{ from: targetPath }} replace />;
    }

    if (requireTeam && isTeamSyncingSelection) {
      return (
        <div className="app-container">
          <div className="main-content">
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div className="loading" style={{ width: 40, height: 40, margin: '0 auto 12px' }}></div>
              <p style={{ color: '#6b7280' }}>切換團隊中，請稍候…</p>
            </div>
          </div>
        </div>
      );
    }

    if (requireTeam && !selectedTeam) {
      sessionStorage.setItem('postTeamRedirect', targetPath);
      return <Navigate to="/teams" state={{ from: targetPath }} replace />;
    }

    return render();
  };

  const redirectParam = sanitizeRedirectPath(new URLSearchParams(location.search).get('redirect'));
  const stateTarget = sanitizeRedirectPath(
    (location.state as { from?: string } | null)?.from || null
  );
  const storedRedirect = sanitizeRedirectPath(sessionStorage.getItem('postLoginRedirect'));
  const loginRedirectTarget =
    redirectParam ||
    storedRedirect ||
    stateTarget ||
    '/teams';

  return (
    <Routes>
      <Route
        path="/login"
        element={!user ? <Login onLogin={onLogin} /> : <Navigate to={loginRedirectTarget} replace />}
      />
      <Route
        path="/teams"
        element={
          <RequireAccess
            requireTeam={false}
            render={() => (
              <TeamSelect user={user} onLogout={onLogout} onSelectTeam={onSelectTeam} />
            )}
          />
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireAccess
            render={() => (
              <Dashboard user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/checkin"
        element={
          <RequireAccess
            render={() => (
              <Checkin user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/workitems"
        element={
          <RequireAccess
            render={() => (
              <WorkItems user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/backlog/:backlogId?"
        element={
          <RequireAccess
            render={() => (
              <Backlog user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/standup-review"
        element={
          <RequireAccess
            render={() => (
              <StandupReview user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/update-work/:itemId?"
        element={
          <RequireAccess
            render={() => (
              <UpdateWork user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/daily-summary"
        element={
          <RequireAccess
            render={() => (
              <DailySummary user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/team-management"
        element={
          <RequireAccess
            render={() => (
              <TeamManagement user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/completed-history/:itemId?"
        element={
          <RequireAccess
            render={() => (
              <CompletedHistory user={user} teamId={selectedTeam as number} onLogout={onLogout} />
            )}
          />
        }
      />
      <Route
        path="/weekly-reports"
        element={
          <RequireAccess
            render={() => <WeeklyReports user={user} teamId={selectedTeam as number} />}
          />
        }
      />
      <Route path="/" element={<Navigate to="/teams" />} />
    </Routes>
  );
}

export default App;
