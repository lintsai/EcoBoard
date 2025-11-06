import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, ArrowLeft } from 'lucide-react';
import api from '../services/api';

interface CheckinProps {
  user: any;
  teamId: number;
  onLogout: () => void;
}

function Checkin({ user, teamId, onLogout }: CheckinProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleCheckin = async () => {
    setLoading(true);
    setError('');
    try {
      await api.checkin(teamId);
      setSuccess(true);
      setTimeout(() => {
        navigate('/workitems');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || '打卡失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="main-content">
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
              打卡時間：{new Date().toLocaleString('zh-TW')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Checkin;
