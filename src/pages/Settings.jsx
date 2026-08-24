import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const API = '';

function Settings() {
  const [settings, setSettings] = useState({
    name: '',
    billing_type: 'METERED',
    flat_rate: 0,
    minimum_cubic_meters: 10,
    minimum_charge: 150,
    rate_per_cubic_meter: 0,
    currency: 'PHP'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState([]);
  
  const userRole = localStorage.getItem('role');
  const [dbUploading, setDbUploading] = useState(false);
  const [dbDownloading, setDbDownloading] = useState(false);
  const [dbResetting, setDbResetting] = useState(false);
  const [resetOption, setResetOption] = useState('FULL');
  
  // User Management
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'ADMIN' });
  const [addingUser, setAddingUser] = useState(false);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  useEffect(() => {
    fetchWithAuth('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data) setSettings(data);
      })
      .catch(err => addToast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
      
    if (userRole === 'SUPER_ADMIN') {
      fetchUsers();
    }
  }, [userRole]);

  const fetchUsers = async () => {
    try {
      const res = await fetchWithAuth('/api/users');
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      addToast('Failed to load users', 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetchWithAuth('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        addToast('Settings updated successfully!');
      } else {
        const err = await response.json();
        addToast(err.error || 'Failed to update settings', 'error');
      }
    } catch (err) {
      addToast('Network error while saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = () => {
    setDbDownloading(true);
    // Generate a temporary link to download
    const token = localStorage.getItem('token');
    fetch('/api/database/backup', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch backup');
      return res.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `water_billing_backup_${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      addToast('Backup downloaded successfully!');
    })
    .catch(() => addToast('Failed to download backup', 'error'))
    .finally(() => setDbDownloading(false));
  };

  const handleRestore = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm('WARNING: Restoring a database will overwrite ALL current data. Are you absolutely sure?')) {
      e.target.value = '';
      return;
    }

    setDbUploading(true);
    const formData = new FormData();
    formData.append('database', file);

    try {
      const res = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      if (res.ok) {
        alert('Database restored successfully. The page will now reload.');
        window.location.reload();
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to restore database', 'error');
      }
    } catch (err) {
      addToast('Network error during restore', 'error');
    } finally {
      setDbUploading(false);
      e.target.value = '';
    }
  };

  const handleReset = async () => {
    if (!window.confirm('DANGER: This will delete records permanently. Are you absolutely sure?')) return;
    
    setDbResetting(true);
    try {
      const res = await fetchWithAuth('/api/database/reset', {
        method: 'POST',
        body: JSON.stringify({ option: resetOption })
      });
      if (res.ok) {
        addToast('Database reset successfully!');
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to reset database', 'error');
      }
    } catch (err) {
      addToast('Network error during reset', 'error');
    } finally {
      setDbResetting(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddingUser(true);
    try {
      const res = await fetchWithAuth('/api/users', {
        method: 'POST',
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        addToast('User created successfully!');
        setNewUser({ username: '', password: '', role: 'ADMIN' });
        fetchUsers();
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to create user', 'error');
      }
    } catch (err) {
      addToast('Network error while creating user', 'error');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetchWithAuth(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('User deleted successfully!');
        fetchUsers();
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to delete user', 'error');
      }
    } catch (err) {
      addToast('Network error while deleting user', 'error');
    }
  };

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">System Settings</h1></div>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">System Settings</h1>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">System Name</label>
            <input 
              type="text" 
              className="form-input" 
              required 
              value={settings.name} 
              onChange={e => setSettings({ ...settings, name: e.target.value })} 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Billing Type</label>
            <select 
              className="form-input" 
              value={settings.billing_type} 
              onChange={e => setSettings({ ...settings, billing_type: e.target.value })}
            >
              <option value="METERED">Metered (per cubic meter)</option>
              <option value="FLAT">Flat Rate (fixed monthly)</option>
            </select>
          </div>

          {settings.billing_type === 'METERED' && (
            <>
              <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '0.75rem', border: '1px solid rgba(99, 102, 241, 0.15)', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  <strong style={{ color: 'var(--text-main)' }}>Tiered Rate Structure:</strong> Consumers pay a fixed minimum charge for the first X cubic meters, then a per-cubic-meter rate for any usage above that threshold.
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
                    <label className="form-label">Min. Cubic Meters (m³)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      className="form-input" 
                      required 
                      value={settings.minimum_cubic_meters} 
                      onChange={e => setSettings({ ...settings, minimum_cubic_meters: e.target.value })} 
                    />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
                    <label className="form-label">Min. Charge (₱)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      className="form-input" 
                      required 
                      value={settings.minimum_charge} 
                      onChange={e => setSettings({ ...settings, minimum_charge: e.target.value })} 
                    />
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Succeeding Rate per Cubic Meter (₱)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-input" 
                  required 
                  value={settings.rate_per_cubic_meter} 
                  onChange={e => setSettings({ ...settings, rate_per_cubic_meter: e.target.value })} 
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Applied to each m³ above the minimum threshold
                </p>
              </div>
            </>
          )}

          {settings.billing_type === 'FLAT' && (
            <div className="form-group">
              <label className="form-label">Flat Rate Amount (₱)</label>
              <input 
                type="number" 
                step="0.01" 
                className="form-input" 
                required 
                value={settings.flat_rate} 
                onChange={e => setSettings({ ...settings, flat_rate: e.target.value })} 
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Currency</label>
            <input 
              type="text" 
              className="form-input" 
              required 
              value={settings.currency} 
              onChange={e => setSettings({ ...settings, currency: e.target.value })} 
            />
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>

      {userRole === 'SUPER_ADMIN' && (
        <>
          <div className="card" style={{ marginTop: '2rem' }}>
            <h2 style={{ marginBottom: '1.5rem' }}>User Management</h2>
            <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
              
              <div>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Existing Users</h3>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td>{u.username}</td>
                          <td>
                            <span className={`badge ${u.role === 'SUPER_ADMIN' ? 'paid' : 'pending'}`}>
                              {u.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            {u.username !== localStorage.getItem('username') && (
                              <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => handleDeleteUser(u.id)}>
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Add New User</h3>
                <form onSubmit={handleAddUser}>
                  <div className="form-group">
                    <label className="form-label">Username</label>
                    <input type="text" className="form-input" required value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input type="password" className="form-input" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select className="form-input" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                      <option value="STAFF">STAFF</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="SUPER_ADMIN">SUPER ADMIN</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={addingUser} style={{ width: '100%' }}>
                    {addingUser ? 'Adding...' : 'Add User'}
                  </button>
                </form>
              </div>

            </div>
          </div>
          <h2 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Danger Zone / Database Management</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>These actions are restricted to Super Admins and affect the entire system.</p>

          <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
            {/* Backup & Restore */}
            <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Backup & Restore</h3>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Download a complete copy of the database.</p>
                <button className="btn btn-secondary" onClick={handleBackup} disabled={dbDownloading}>
                  {dbDownloading ? (
                    <>
                      <div className="spinner-mini"></div>
                      Downloading...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Download Backup
                    </>
                  )}
                </button>
              </div>

              <div>
                <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--danger)' }}>Restore from a backup file (overwrites current data).</p>
                <input 
                  type="file" 
                  accept=".db,.sqlite" 
                  style={{ display: 'none' }} 
                  id="db-upload"
                  onChange={handleRestore}
                  disabled={dbUploading}
                />
                <label htmlFor="db-upload" className={`btn btn-secondary ${dbUploading ? 'disabled' : ''}`} style={{ display: 'inline-flex', cursor: dbUploading ? 'not-allowed' : 'pointer', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                  {dbUploading ? (
                    <>
                      <div className="spinner-mini" style={{ borderColor: 'rgba(244, 63, 94, 0.3)', borderTopColor: 'currentColor' }}></div>
                      Restoring...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                      Restore Database
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Reset Data */}
            <div style={{ padding: '1.5rem', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--danger)' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--danger)' }}>Reset System Records</h3>
              <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Permanently delete records to start fresh. System settings and Super Admin account are kept.</p>
              
              <div className="form-group">
                <label className="form-label">Reset Mode</label>
                <select 
                  className="form-input" 
                  value={resetOption}
                  onChange={e => setResetOption(e.target.value)}
                >
                  <option value="FULL">Full Wipe (Delete Consumers, Billings, Payments)</option>
                  <option value="KEEP_CONSUMERS">Keep Consumers (Delete Billings & Payments only)</option>
                </select>
              </div>

              <button 
                className="btn btn-primary" 
                style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={handleReset}
                disabled={dbResetting}
              >
                {dbResetting ? 'Resetting...' : 'Permanently Reset Records'}
              </button>
            </div>
          </div>
        </>
      )}

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

export default Settings;
