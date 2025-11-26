import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
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
import './App.css';

interface User {
  id: number;
  username: string;
  displayName: string;
  email?: string;
}

interface AppRoutesProps {
  user: User | null;
  selectedTeam: number | null;
  onSelectTeam: (teamId: number) => void;
  onLogin: (userData: User, token: string) => void;
  onLogout: () => void;
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
    const storedTeam = localStorage.getItem('selectedTeam');
    return storedTeam ? Number(storedTeam) : null;
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const response = await api.verifyToken();
        if (response.valid) {
          setUser(response.user);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('selectedTeam');
      setSelectedTeam(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (userData: User, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('selectedTeam');
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
      />
    </Router>
  );
}

function AppRoutes({ user, selectedTeam, onSelectTeam, onLogin, onLogout }: AppRoutesProps) {
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const teamFromUrl = params.get('teamId');
    if (teamFromUrl && !Number.isNaN(Number(teamFromUrl))) {
      const parsed = Number(teamFromUrl);
      if (selectedTeam !== parsed) {
        onSelectTeam(parsed);
        localStorage.setItem('selectedTeam', String(parsed));
      }
    }
  }, [location.search, onSelectTeam, selectedTeam]);

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
    const targetPath = location.pathname + location.search + location.hash;

    if (!user) {
      sessionStorage.setItem('postLoginRedirect', targetPath);
      return <Navigate to="/login" state={{ from: targetPath }} replace />;
    }

    if (requireTeam && !selectedTeam) {
      sessionStorage.setItem('postTeamRedirect', targetPath);
      return <Navigate to="/teams" state={{ from: targetPath }} replace />;
    }

    return render();
  };

  const loginRedirectTarget = sessionStorage.getItem('postLoginRedirect') || '/teams';

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
