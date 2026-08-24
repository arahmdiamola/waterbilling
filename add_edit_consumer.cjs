const fs = require('fs');
let code = fs.readFileSync('src/pages/Consumers.jsx', 'utf8');

// 1. Add states
const statesRegex = /const \[formData, setFormData\] = useState\([^)]+\);/;
code = code.replace(statesRegex, `const [formData, setFormData] = useState({ name: '', meter_number: '', address: '', contact_number: '' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', name: '', meter_number: '', address: '', contact_number: '' });`);

// 2. Add handlers
const handlersRegex = /const handleAddSubmit = async \(e\) => \{/;
code = code.replace(handlersRegex, `const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetchWithAuth(\`/api/consumers/\${editForm.id}\`, {
        method: 'PUT',
        body: JSON.stringify(editForm)
      });
      if (response.ok) {
        addToast('Consumer updated successfully');
        setShowEditModal(false);
        fetchConsumers();
      } else {
        const err = await response.json();
        addToast(err.error || 'Failed to update consumer', 'error');
      }
    } catch (err) {
      addToast('Network error', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this consumer?')) return;
    try {
      const response = await fetchWithAuth(\`/api/consumers/\${id}\`, { method: 'DELETE' });
      if (response.ok) {
        addToast('Consumer deleted successfully');
        fetchConsumers();
      } else {
        const err = await response.json();
        addToast(err.error || 'Failed to delete consumer', 'error');
      }
    } catch (err) {
      addToast('Network error', 'error');
    }
  };

  const handleAddSubmit = async (e) => {`);

// 3. Add buttons
const buttonsRegex = /Download QR\n\s*<\/button>\n\s*<\/td>/;
code = code.replace(buttonsRegex, `Download QR
                        </button>
                        {userRole === 'SUPER_ADMIN' && (
                          <>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', marginRight: '0.5rem' }}
                              onClick={() => {
                                setEditForm({ id: c.id, name: c.name, meter_number: c.meter_number || '', address: c.address || '', contact_number: c.contact_number || '' });
                                setShowEditModal(true);
                              }}
                            >
                              Edit
                            </button>
                            <button 
                              className="btn btn-danger" 
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: '#dc3545', color: 'white', border: 'none' }}
                              onClick={() => handleDelete(c.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>`);

// 4. Add Edit Modal
const modalRegex = /\{showAddModal && \(/;
code = code.replace(modalRegex, `{showEditModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Edit Consumer</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="form-input" required value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Meter Number</label>
                  <input type="text" className="form-input" required={!isFlat} value={editForm.meter_number} onChange={e => setEditForm({...editForm, meter_number: e.target.value})} />
                  {isFlat && <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Optional for flat rate billing</small>}
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input type="text" className="form-input" required value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Number</label>
                  <input type="text" className="form-input" value={editForm.contact_number} onChange={e => setEditForm({...editForm, contact_number: e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (`);

fs.writeFileSync('src/pages/Consumers.jsx', code);
console.log('done frontend');
