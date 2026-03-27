import React, { useState, useEffect } from 'react';
import { useAuth } from '../../AuthContext';
import { useTheme } from '../../ThemeContext';
import { Phone, CheckCircle, AlertTriangle } from 'lucide-react';
import './EmergencyModal.css';

const EmergencyModal = ({ onClose }) => {
  const [timeLeft, setTimeLeft] = useState(24 * 60 * 60); // 24 hours in seconds for demo
  const { theme } = useTheme();

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}時間 ${m}分 ${s}秒`;
  };

  return (
    <div className="modal-overlay emergency-overlay">
      <div className="modal-content glass-panel emergency-card">
        <div className="emergency-icon">
          <AlertTriangle size={48} color="var(--danger)" />
        </div>
        <h2>【緊急通信】本部より</h2>
        <div className="emergency-message">
          <p>台風接近に伴い、午後からの屋外作業は全休としてください。</p>
          <p>早急に機材の撤収と安全確認をお願いします。</p>
        </div>
        
        <div className="countdown">
          残り: <span>{formatTime(timeLeft)}</span>
        </div>

        <div className="emergency-actions">
          <a href="tel:0000000000" className="btn btn-outline emergency-call">
            <Phone size={18} /> 本部に電話
          </a>
          <button onClick={onClose} className="btn btn-primary emergency-confirm" style={{ backgroundColor: 'var(--danger)' }}>
            <CheckCircle size={18} /> 確認・了承
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmergencyModal;
