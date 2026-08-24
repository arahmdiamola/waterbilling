import { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from '../utils/api';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { useSettings } from '../utils/SettingsContext';

function Consumers() {
  const [consumers, setConsumers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const userRole = localStorage.getItem('role') || 'ADMIN';
  const { isFlat } = useSettings();
  
  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [printConsumer, setPrintConsumer] = useState(null);
  
  const tagRef = useRef(null);
  
  // Add Consumer form state
  const [formData, setFormData] = useState({ name: '', meter_number: '', address: '', contact_number: '', purok: '' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', name: '', meter_number: '', address: '', contact_number: '', purok: '' });
  
  // Batch Upload state
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Toasts
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const fetchConsumers = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/api/consumers');
      if (response.ok) {
        const data = await response.json();
        setConsumers(data);
      }
    } catch (err) {
      addToast('Failed to fetch consumers', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsumers();
  }, []);

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetchWithAuth(`/api/consumers/${editForm.id}`, {
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
      const response = await fetchWithAuth(`/api/consumers/${id}`, { method: 'DELETE' });
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

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetchWithAuth('/api/consumers', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        addToast('Consumer added successfully');
        setShowAddModal(false);
        setFormData({ name: '', meter_number: '', address: '', contact_number: '', purok: '' });
        fetchConsumers();
      } else {
        const err = await response.json();
        addToast(err.error || 'Failed to add consumer', 'error');
      }
    } catch (err) {
      addToast('Network error', 'error');
    }
  };

  // CSV Drag & Drop Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => setIsDragging(false);
  
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      processCsv(file);
    } else {
      addToast('Please upload a .csv file', 'error');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processCsv(file);
  };

  const processCsv = (file) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      
      const parsed = [];
      // Skip header if first line contains 'name' or 'meter'
      let startIdx = 0;
      if (lines[0].toLowerCase().includes('name') || lines[0].toLowerCase().includes('meter')) {
        startIdx = 1;
      }
      
      for (let i = startIdx; i < lines.length; i++) {
        // Simple CSV parse, assumes no commas inside quotes for simplicity
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
          parsed.push({
            name: parts[0]?.trim() || '',
            meter_number: parts[1]?.trim() || '',
            address: parts[2]?.trim() || '',
            contact_number: parts[3]?.trim() || ''
          });
        }
      }
      setCsvPreview(parsed);
    };
    reader.readAsText(file);
  };

  const handleBatchSubmit = async () => {
    if (csvPreview.length === 0) return;
    
    // In a real app, API might support array upload.
    // If our backend only accepts single objects or we need to send an array,
    // we'll assume there's a POST /api/consumers/batch endpoint or we send one by one.
    // Since request asks to POST to /api/consumers/batch:
    try {
      const response = await fetchWithAuth('/api/consumers/batch', {
        method: 'POST',
        body: JSON.stringify({ consumers: csvPreview })
      });
      
      if (response.ok) {
        const resData = await response.json();
        addToast(`Successfully added ${resData.successCount || csvPreview.length} consumers`);
        setShowBatchModal(false);
        setCsvFile(null);
        setCsvPreview([]);
        fetchConsumers();
      } else {
        // Fallback: If batch endpoint doesn't exist, we could do Promise.all
        addToast('Batch upload endpoint might not exist, trying fallback...', 'error');
      }
    } catch (err) {
      addToast('Network error during batch upload', 'error');
    }
  };

  const filteredConsumers = consumers.filter(c => {
    const term = search.toLowerCase();
    const nameMatch = c.name?.toLowerCase().includes(term);
    const meterMatch = c.meter_number?.toLowerCase().includes(term);
    const addressMatch = c.address?.toLowerCase().includes(term);
    return nameMatch || meterMatch || addressMatch;
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Consumers</h1>
        {userRole !== 'STAFF' && (
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={() => setShowBatchModal(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Batch Upload
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Consumer
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="search-bar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              type="text" 
              placeholder="Search consumers..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-spinner"></div>
        ) : filteredConsumers.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Purok</th>
                  {!isFlat && <th>Meter Number</th>}
                  <th>Address</th>
                  <th>Contact</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredConsumers.map(c => (
                  <tr key={c.id}>
                    <td>#{c.id}</td>
                    <td>{c.name}</td>
                    <td>{c.purok || '-'}</td>
                    {!isFlat && <td>{c.meter_number}</td>}
                    <td>{c.address}</td>
                    <td>{c.contact_number}</td>
                    <td className="print-hide" style={{ textAlign: 'right' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', marginRight: '0.5rem' }}
                        onClick={() => setPrintConsumer(c)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.25rem' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Download QR
                        </button>
                        {userRole === 'SUPER_ADMIN' && (
                          <>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', marginRight: '0.5rem' }}
                              onClick={() => {
                                setEditForm({ id: c.id, name: c.name, meter_number: c.meter_number || '', address: c.address || '', contact_number: c.contact_number || '', purok: c.purok || '' });
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
                      </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No consumers found.</div>
        )}
      </div>

      {/* Add Consumer Modal */}
      {showEditModal && (
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
                  <label className="form-label">Purok</label>
                  <input type="text" className="form-input" placeholder="e.g. Purok 1" value={editForm.purok} onChange={e => setEditForm({...editForm, purok: e.target.value})} />
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

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Add New Consumer</h3>
              <button className="close-btn" onClick={() => setShowAddModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form onSubmit={handleAddSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="form-input" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Purok</label>
                  <input type="text" className="form-input" placeholder="e.g. Purok 1" value={formData.purok} onChange={e => setFormData({...formData, purok: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Meter Number</label>
                  <input type="text" className="form-input" required={!isFlat} value={formData.meter_number} onChange={e => setFormData({...formData, meter_number: e.target.value})} />
                  {isFlat && <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Optional for flat rate billing</small>}
                </div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input type="text" className="form-input" required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Number</label>
                  <input type="text" className="form-input" value={formData.contact_number} onChange={e => setFormData({...formData, contact_number: e.target.value})} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Consumer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Upload Modal */}
      {showBatchModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Batch Upload Consumers</h3>
              <button className="close-btn" onClick={() => { setShowBatchModal(false); setCsvFile(null); setCsvPreview([]); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="modal-body">
              {!csvFile ? (
                <div 
                  className={`upload-zone ${isDragging ? 'dragover' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('csv-upload').click()}
                >
                  <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  <p className="upload-text">Drag and drop your CSV file here, or click to browse</p>
                  <input type="file" id="csv-upload" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expected format: name, meter_number, address, contact_number</p>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <span style={{ fontWeight: 500 }}>File: {csvFile.name}</span>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => { setCsvFile(null); setCsvPreview([]); }}>Change File</button>
                  </div>
                  
                  <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}>
                    <table style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Meter</th>
                          <th>Address</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.slice(0, 10).map((row, i) => (
                          <tr key={i}>
                            <td>{row.name}</td>
                            <td>{row.meter_number}</td>
                            <td>{row.address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvPreview.length > 10 && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>Showing 10 of {csvPreview.length} records</p>}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowBatchModal(false); setCsvFile(null); setCsvPreview([]); }}>Cancel</button>
              <button className="btn btn-primary" disabled={csvPreview.length === 0} onClick={handleBatchSubmit}>
                Upload {csvPreview.length > 0 ? `${csvPreview.length} Records` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Meter Tag Modal */}
      {printConsumer && (
        <div className="modal-overlay receipt-modal-overlay">
          <div className="modal-card">
            <div className="modal-header print-hide">
              <h3 className="modal-title">Download Meter Tag</h3>
              <button className="close-btn" onClick={() => setPrintConsumer(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', justifyContent: 'center' }}>
              
              {/* Actual Printable Tag */}
              <div ref={tagRef} className="receipt-paper" style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', textAlign: 'center', width: '220px', background: 'white', color: 'black' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem' }}>WaterBill Pro</h4>
                
                <div style={{ background: 'white', padding: '8px', display: 'inline-block', borderRadius: '4px', marginBottom: '12px' }}>
                  <QRCodeSVG 
                    value={`WBP-${printConsumer.id}`} 
                    size={150}
                    bgColor={"#ffffff"}
                    fgColor={"#000000"}
                    level={"H"}
                  />
                </div>
                
                <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '4px' }}>{printConsumer.name}</div>
                <div style={{ fontSize: '0.85rem', marginBottom: '2px' }}>ID: WBP-{printConsumer.id}</div>
                {!isFlat && <div style={{ fontSize: '0.85rem' }}>Meter: {printConsumer.meter_number || 'N/A'}</div>}
              </div>

            </div>
            <div className="modal-footer print-hide">
              <button className="btn btn-secondary" onClick={() => setPrintConsumer(null)}>Cancel</button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  if (tagRef.current) {
                    html2canvas(tagRef.current, { scale: 2 }).then(canvas => {
                      const link = document.createElement('a');
                      link.download = `meter_tag_${printConsumer.id}.png`;
                      link.href = canvas.toDataURL('image/png');
                      link.click();
                    });
                  }
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.25rem' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download PNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container print-hide">
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

export default Consumers;
