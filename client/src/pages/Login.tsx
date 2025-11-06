import { useState } from 'react';
import { LogIn } from 'lucide-react';
import api from '../services/api';

interface LoginProps {
  onLogin: (user: any, token: string) => void;
}

function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.login(username, password);
      onLogin(response.user, response.token);
    } catch (err: any) {
      setError(err.response?.data?.error || '登入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 style={{ marginBottom: '10px', color: '#667eea', textAlign: 'center' }}>
          EcoBoard
        </h1>
        <p style={{ marginBottom: '30px', color: '#6b7280', textAlign: 'center' }}>
          團隊工作管理系統
        </p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#374151' }}>
              使用者名稱
            </label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#374151' }}>
              密碼
            </label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? (
              <span className="loading"></span>
            ) : (
              <>
                <LogIn size={18} />
                登入
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
          使用 LDAP 帳號登入
        </div>
      </div>
    </div>
  );
}

export default Login;
