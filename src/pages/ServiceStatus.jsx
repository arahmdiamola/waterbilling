import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

function ServiceStatus() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('disconnection');
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/service-status');
      if (res.ok) {
        setData(await res.json());
      } else {
        addToast('Failed to load service status', 'error');
      }
    } catch (err) {
      addToast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updateStatus = async (consumerId, newStatus, consumerName) => {
    if (!window.confirm(`Are you sure you want to mark "${consumerName}" as ${newStatus.replace('_', ' ')}?`)) return;
    try {
      const res = await fetchWithAuth(`/api/consumers/${consumerId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        addToast(`${consumerName} marked as ${newStatus.replace('_', ' ')}`);
        fetchData();
      } else {
        const err = await res.json();
        addToast(err.error || 'Failed to update status', 'error');
      }
    } catch (err) {
      addToast('Network error', 'error');
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Service Status</h1></div>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const tabs = [
    { key: 'disconnection', label: `For Disconnection (${data?.for_disconnection?.length || 0})`, color: 'var(--danger)' },
    { key: 'repair', label: `For Repair (${data?.for_repair?.length || 0})`, color: '#f59e0b' },
    { key: 'disconnected', label: `Disconnected (${data?.disconnected?.length || 0})`, color: 'var(--text-muted)' }
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Service Status</h1>
        <div className="header-actions">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0.5rem 1rem', backgroundColor: 'var(--bg-color)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
            Disconnection threshold: <strong style={{ color: 'var(--danger)' }}>{data?.disconnect_months || 3} months</strong> unpaid
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div className="stat-title">For Disconnection</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{data?.for_disconnection?.length || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>≥ {data?.disconnect_months || 3} months unpaid</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="stat-title">For Repair</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{data?.for_repair?.length || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Needs maintenance</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid var(--text-muted)' }}>
          <div className="stat-title">Disconnected</div>
          <div className="stat-value">{data?.disconnected?.length || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Currently disconnected</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '2px solid var(--border-color)' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.75rem 1.25rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? tab.color : 'var(--text-muted)',
              borderBottom: activeTab === tab.key ? `3px solid ${tab.color}` : '3px solid transparent',
              marginBottom: '-2px',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* For Disconnection Tab */}
      {activeTab === 'disconnection' && (
        <div className="card">
          {data?.for_disconnection?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.5 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              <p>No consumers are due for disconnection. All accounts are in good standing!</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Consumer</th>
                    <th>Purok</th>
                    <th>Unpaid Months</th>
                    <th>Oldest Unpaid</th>
                    <th>Total Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.for_disconnection.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{c.name}</div>
                        {c.address && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.address}</div>}
                      </td>
                      <td>{c.purok || '-'}</td>
                      <td>
                        <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', padding: '0.25rem 0.75rem', fontWeight: 600 }}>
                          {c.unpaid_months} months
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{c.oldest_unpaid}</td>
                      <td style={{ fontWeight: 600, color: 'var(--danger)' }}>
                        ₱{c.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span className={`badge ${c.status === 'ACTIVE' ? 'paid' : c.status === 'FOR_REPAIR' ? 'partial' : 'pending'}`}>
                          {c.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                            onClick={() => updateStatus(c.id, 'DISCONNECTED', c.name)}
                          >
                            Disconnect
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: '#f59e0b', color: '#f59e0b' }}
                            onClick={() => updateStatus(c.id, 'FOR_REPAIR', c.name)}
                          >
                            Mark Repair
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* For Repair Tab */}
      {activeTab === 'repair' && (
        <div className="card">
          {data?.for_repair?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.5 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              <p>No consumers are marked for repair.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Consumer</th>
                    <th>Purok</th>
                    <th>Meter #</th>
                    <th>Contact</th>
                    <th>Address</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.for_repair.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td>{c.purok || '-'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{c.meter_number || '-'}</td>
                      <td>{c.contact_number || '-'}</td>
                      <td>{c.address || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: 'var(--success)', color: 'var(--success)' }}
                            onClick={() => updateStatus(c.id, 'ACTIVE', c.name)}
                          >
                            Mark Repaired
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                            onClick={() => updateStatus(c.id, 'DISCONNECTED', c.name)}
                          >
                            Disconnect
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Disconnected Tab */}
      {activeTab === 'disconnected' && (
        <div className="card">
          {data?.disconnected?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <p>No consumers are currently disconnected.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Consumer</th>
                    <th>Purok</th>
                    <th>Meter #</th>
                    <th>Address</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.disconnected.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td>{c.purok || '-'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{c.meter_number || '-'}</td>
                      <td>{c.address || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: 'var(--success)', color: 'var(--success)' }}
                            onClick={() => updateStatus(c.id, 'ACTIVE', c.name)}
                          >
                            Reconnect
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderColor: '#f59e0b', color: '#f59e0b' }}
                            onClick={() => updateStatus(c.id, 'FOR_REPAIR', c.name)}
                          >
                            Mark Repair
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ServiceStatus;
