import React, { useEffect, useState } from 'react';
import { Wifi, Copy, Check } from 'lucide-react';

interface NetworkInfoProps {
  addNotification: (msg: string, type: 'success' | 'error') => void;
}

export const NetworkInfo: React.FC<NetworkInfoProps> = ({ addNotification }) => {
  const [localIp, setLocalIp] = useState<string>('');
  const [port, setPort] = useState<string>('8042');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    // Determine the port
    setPort(window.location.port || '8000');

    // Fetch the local network IP from the backend
    fetch('/api/network-info')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch network info');
        return res.json();
      })
      .then((data) => {
        if (data.local_ip) {
          setLocalIp(data.local_ip);
        }
      })
      .catch((err) => {
        console.error('Error fetching network info:', err);
        // Fallback: use current window location hostname if not localhost
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          setLocalIp(window.location.hostname);
        }
      });
  }, []);

  const accessUrl = localIp ? `http://${localIp}:${port}` : '';

  const handleCopy = () => {
    if (!accessUrl) return;
    navigator.clipboard.writeText(accessUrl)
      .then(() => {
        setCopied(true);
        addNotification('URL copied to clipboard!', 'success');
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
        addNotification('Failed to copy URL.', 'error');
      });
  };

  if (!localIp) return null;

  return (
    <div className="network-badge">
      <div className="network-dot" />
      <Wifi size={14} />
      <span>Accessible on local network: </span>
      <strong 
        onClick={handleCopy} 
        style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        title="Click to copy URL"
      >
        {accessUrl}
        {copied ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
      </strong>
    </div>
  );
};
