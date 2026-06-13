import { useState } from 'react';
import { Layers, LayoutGrid, FileText, FileUp, Wrench, ShieldCheck, X } from 'lucide-react';
import { MergeTab } from './components/MergeTab';
import { OrganizeTab } from './components/OrganizeTab';
import { ConvertTab } from './components/ConvertTab';
import { DocToPdfTab } from './components/DocToPdfTab';
import { NetworkInfo } from './components/NetworkInfo';
import './App.css';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

function App() {
  const [activeTab, setActiveTab] = useState<'merge' | 'organize' | 'convert' | 'docToPdf'>('merge');
  const [notifications, setNotifications] = useState<Toast[]>([]);

  const addNotification = (message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { id, message, type }]);

    // Auto-remove notification after 4 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <>
      {/* Premium Gradient Header */}
      <header className="app-header">
        <div className="logo-container">
          <Wrench className="logo-icon" size={36} />
          <h1 className="app-title">PDF Tools</h1>
        </div>
        <p className="app-subtitle">
          Merge, rotate, delete, and convert PDFs locally. Fast, secure, and run directly on your browser and local machine.
        </p>
        
        {/* Local Network Info */}
        <NetworkInfo addNotification={addNotification} />
      </header>

      {/* Tabs Controller */}
      <nav className="tabs-container">
        <button
          className={`tab-btn ${activeTab === 'merge' ? 'active' : ''}`}
          onClick={() => setActiveTab('merge')}
        >
          <Layers size={18} />
          Merge PDFs
        </button>
        <button
          className={`tab-btn ${activeTab === 'organize' ? 'active' : ''}`}
          onClick={() => setActiveTab('organize')}
        >
          <LayoutGrid size={18} />
          Organize PDF
        </button>
        <button
          className={`tab-btn ${activeTab === 'convert' ? 'active' : ''}`}
          onClick={() => setActiveTab('convert')}
        >
          <FileText size={18} />
          PDF to Word
        </button>
        <button
          className={`tab-btn ${activeTab === 'docToPdf' ? 'active' : ''}`}
          onClick={() => setActiveTab('docToPdf')}
        >
          <FileUp size={18} />
          Doc to PDF
        </button>
      </nav>

      {/* Active Tab Content */}
      <main className="tab-content">
        {activeTab === 'merge' && <MergeTab addNotification={addNotification} />}
        {activeTab === 'organize' && <OrganizeTab addNotification={addNotification} />}
        {activeTab === 'convert' && <ConvertTab addNotification={addNotification} />}
        {activeTab === 'docToPdf' && <DocToPdfTab addNotification={addNotification} />}
      </main>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', padding: '32px 0 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '8px' }}>
          <ShieldCheck size={14} style={{ color: 'var(--color-success)' }} />
          <span>Privacy First: Page operations execute client-side. Your documents stay safe.</span>
        </div>
        <p>&copy; {new Date().getFullYear()} PDF Tools. Running locally on network.</p>
      </footer>

      {/* Custom Toast System (Renders safe dynamic alerts) */}
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {notifications.map((n) => (
          <div key={n.id} className={`notification-toast ${n.type}`}>
            <span className="toast-msg">{n.message}</span>
            <button className="toast-close" onClick={() => removeNotification(n.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
