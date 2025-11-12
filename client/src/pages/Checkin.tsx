import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, ArrowLeft, FileText } from 'lucide-react';
import api from '../services/api';

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

  useEffect(() => {
    checkTodayCheckin();
  }, [teamId]);

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
      </div>
    </div>
  );
}

export default Checkin;
