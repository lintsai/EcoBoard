import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
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
import api from './services/api';
import './App.css';

interface User {
  id: number;
  username: string;
  displayName: string;
  email?: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

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
      <Routes>
        <Route
          path="/login"
          element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/teams" />}
        />
        <Route
          path="/teams"
          element={
            user ? (
              <TeamSelect user={user} onLogout={handleLogout} onSelectTeam={setSelectedTeam} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            user && selectedTeam ? (
              <Dashboard user={user} teamId={selectedTeam} onLogout={handleLogout} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route
          path="/checkin"
          element={
            user && selectedTeam ? (
              <Checkin user={user} teamId={selectedTeam} onLogout={handleLogout} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route
          path="/workitems"
          element={
            user && selectedTeam ? (
              <WorkItems user={user} teamId={selectedTeam} onLogout={handleLogout} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route
          path="/backlog"
          element={
            user && selectedTeam ? (
              <Backlog user={user} teamId={selectedTeam} onLogout={handleLogout} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route
          path="/standup-review"
          element={
            user && selectedTeam ? (
              <StandupReview user={user} teamId={selectedTeam} onLogout={handleLogout} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route
          path="/update-work"
          element={
            user && selectedTeam ? (
              <UpdateWork user={user} teamId={selectedTeam} onLogout={handleLogout} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route
          path="/daily-summary"
          element={
            user && selectedTeam ? (
              <DailySummary user={user} teamId={selectedTeam} onLogout={handleLogout} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route
          path="/team-management"
          element={
            user && selectedTeam ? (
              <TeamManagement user={user} teamId={selectedTeam} onLogout={handleLogout} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route
          path="/weekly-reports"
          element={
            user && selectedTeam ? (
              <WeeklyReports user={user} teamId={selectedTeam} />
            ) : (
              <Navigate to="/teams" />
            )
          }
        />
        <Route path="/" element={<Navigate to="/teams" />} />
      </Routes>
    </Router>
  );
}

export default App;
