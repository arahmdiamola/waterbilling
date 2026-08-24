import { useState, useEffect } from 'react';
import Receipt from './Receipt';
import BillNotice from './BillNotice';
import { fetchWithAuth } from '../utils/api';
import { useSettings } from '../utils/SettingsContext';

const API = '';

function Billing() {
  const { isFlat } = useSettings();
  const [bills, setBills] = useState([]);
  const [consumers, setConsumers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showBillModal, setShowBillModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);

  const [billForm, setBillForm] = useState({ consumer_id: '', billing_month: '', previous_reading: '', current_reading: '', due_date: '' });
  const [payForm, setPayForm] = useState({ amount_paid: '' });

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedAdjustBill, setSelectedAdjustBill] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ current_reading: '' });

  const [receiptData, setReceiptData] = useState(null);
  const [billNoticeId, setBillNoticeId] = useState(null);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [billsRes, consumersRes] = await Promise.all([
        fetchWithAuth('/api/billings'),
        fetchWithAuth('/api/consumers')
      ]);
      if (billsRes.ok) setBills(await billsRes.json());
      if (consumersRes.ok) setConsumers(await consumersRes.json());
    } catch (err) {
      addToast('Failed to fetch data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleBillSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetchWithAuth('/api/billings', {
        method: 'POST',
        body: JSON.stringify(billForm)
      });
      if (response.ok) {
        addToast('Bill generated successfully');
        setShowBillModal(false);
        setBillForm({ consumer_id: '', billing_month: '', previous_reading: '', current_reading: '', due_date: '' });
        fetchData();
      } else {
        const err = await response.json();
        addToast(err.error || 'Failed to generate bill', 'error');
      }
    } catch (err) {
      addToast('Network error', 'error');
    }
  };

  const openAdjustModal = (bill) => {
    setSelectedAdjustBill(bill);
    setAdjustForm({ current_reading: bill.current_reading ?? '' });
    setShowAdjustModal(true);
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth(`/api/billings/${selectedAdjustBill.id}/adjust`, {
        method: 'PUT',
        body: JSON.stringify(adjustForm)
      });
      if (res.ok) {
        addToast('Bill adjusted successfully');
        setShowAdjustModal(false);
        fetchData();
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to adjust bill', 'error');
      }
    } catch (err) {
      addToast('Network error during adjust', 'error');
    }
  };

  const getRemainingBalance = (bill) => {
    if (bill.status === 'PAID') return 0;
    if (bill._totalPaid !== undefined) return Math.max(0, bill.amount_due - bill._totalPaid);
    return bill.amount_due;
  };

  const openPayModal = async (bill) => {
    // Fetch payment history for this bill to know remaining balance
    try {
      const res = await fetchWithAuth(`/api/billings/${bill.id}/payments`);
      if (res.ok) {
        const data = await res.json();
        const remaining = data.remaining_balance;
        setSelectedBill({ ...bill, _remaining: remaining, _totalPaid: data.total_paid });
        setPayForm({ amount_paid: remaining.toFixed(2) });
      } else {
        setSelectedBill({ ...bill, _remaining: bill.amount_due, _totalPaid: 0 });
        setPayForm({ amount_paid: bill.amount_due.toFixed(2) });
      }
    } catch {
      setSelectedBill({ ...bill, _remaining: bill.amount_due, _totalPaid: 0 });
      setPayForm({ amount_paid: bill.amount_due.toFixed(2) });
    }
    setShowPayModal(true);
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    const remaining = selectedBill._remaining || selectedBill.amount_due;
    if (Number(payForm.amount_paid) > remaining) {
      addToast('Cannot pay more than the remaining balance', 'error');
      return;
    }
    if (Number(payForm.amount_paid) <= 0) {
      addToast('Amount must be greater than 0', 'error');
      return;
    }

    try {
      const response = await fetchWithAuth('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          billing_id: selectedBill.id,
          amount_paid: payForm.amount_paid,
          payment_method: 'CASH'
        })
      });
      if (response.ok) {
        const result = await response.json();
        addToast(`Payment recorded! Receipt: ${result.receipt_number}`);
        setShowPayModal(false);

        // Fetch receipt data
        try {
          const receiptRes = await fetchWithAuth(`/api/payments/receipt/${result.payment_id}`);
          if (receiptRes.ok) {
            setReceiptData(await receiptRes.json());
          }
        } catch {
          // Build local receipt fallback
          setReceiptData({
            receipt_number: result.receipt_number,
            consumer_name: selectedBill.consumer_name,
            billing_month: selectedBill.billing_month,
            amount_due: selectedBill.amount_due,
            amount_paid: Number(payForm.amount_paid),
            remaining_balance: result.remaining_balance,
            payment_type: result.new_status === 'PAID' ? 'FULL' : 'PARTIAL',
            payment_date: new Date().toISOString().split('T')[0],
            previous_reading: selectedBill.previous_reading,
            current_reading: selectedBill.current_reading,
            consumption: selectedBill.consumption,
            total_paid_for_bill: result.total_paid
          });
        }

        setSelectedBill(null);
        setPayForm({ amount_paid: '' });
        fetchData();
      } else {
        const err = await response.json();
        addToast(err.error || 'Failed to record payment', 'error');
      }
    } catch (err) {
      addToast('Network error', 'error');
    }
  };

  return (
    <div>
      <div className="page-header print-hide">
        <h1 className="page-title">Billing & Payments</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowBillModal(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Generate Bill
          </button>
        </div>
      </div>

      <div className="card print-hide">
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="search-bar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              type="text" 
              placeholder="Search bills, consumers, address..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-spinner"></div>
        ) : bills.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Consumer</th>
                  <th>Month</th>
                  {!isFlat && <th>Consumption</th>}
                  <th>Amount Due</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {bills.filter(b => {
                  const term = search.toLowerCase();
                  
                  if (term.startsWith('wbp-')) {
                    const idStr = term.replace('wbp-', '');
                    return String(b.consumer_id) === idStr;
                  }

                  return b.consumer_name?.toLowerCase().includes(term) ||
                         b.consumer_address?.toLowerCase().includes(term) ||
                         b.consumer_meter?.toLowerCase().includes(term) ||
                         b.billing_month?.toLowerCase().includes(term) ||
                         b.status?.toLowerCase().includes(term) ||
                         b.id?.toString().includes(term);
                }).map(bill => (
                  <tr key={bill.id}>
                    <td>#{bill.id}</td>
                    <td>{bill.consumer_name}</td>
                    <td>{bill.billing_month}</td>
                    {!isFlat && <td>{bill.consumption != null ? `${Number(bill.consumption).toFixed(1)} m³` : 'N/A'}</td>}
                    <td style={{ fontWeight: 600 }}>₱{Number(bill.amount_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td><span className={`badge ${bill.status.toLowerCase()}`}>{bill.status}</span></td>
                    <td style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setBillNoticeId(bill.id)}>
                        Print Bill
                      </button>
                      {!isFlat && (bill.status === 'PENDING' || bill.status === 'PARTIAL') && (
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openAdjustModal(bill)}>
                          Adjust
                        </button>
                      )}
                      {(bill.status === 'PENDING' || bill.status === 'PARTIAL') && (
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => openPayModal(bill)}>
                          {bill.status === 'PARTIAL' ? 'Add Payment' : 'Record Payment'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No bills found. Click "Generate Bill" to create one.</div>
        )}
      </div>

      {/* Generate Bill Modal */}
      {showBillModal && (
        <div className="modal-overlay print-hide">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Generate New Bill</h3>
              <button className="close-btn" onClick={() => setShowBillModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form onSubmit={handleBillSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Consumer</label>
                  <select className="form-input" required value={billForm.consumer_id} onChange={e => setBillForm({ ...billForm, consumer_id: e.target.value })}>
                    <option value="">Select Consumer...</option>
                    {consumers.map(c => <option key={c.id} value={c.id}>{c.name}{!isFlat && ` (${c.meter_number || 'No meter'})`}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Billing Month</label>
                  <input type="month" className="form-input" required value={billForm.billing_month} onChange={e => setBillForm({ ...billForm, billing_month: e.target.value })} />
                </div>
                {!isFlat && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Previous Reading</label>
                      <input type="number" step="0.01" className="form-input" value={billForm.previous_reading} onChange={e => setBillForm({ ...billForm, previous_reading: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Current Reading</label>
                      <input type="number" step="0.01" className="form-input" value={billForm.current_reading} onChange={e => setBillForm({ ...billForm, current_reading: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input type="date" className="form-input" value={billForm.due_date} onChange={e => setBillForm({ ...billForm, due_date: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBillModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Generate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayModal && selectedBill && (
        <div className="modal-overlay print-hide">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Record Payment</h3>
              <button className="close-btn" onClick={() => setShowPayModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form onSubmit={handlePaySubmit}>
              <div className="modal-body">
                <div style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Consumer: <strong style={{ color: 'var(--text-main)' }}>{selectedBill.consumer_name}</strong></p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Bill Amount: <strong style={{ color: 'var(--text-main)' }}>₱{Number(selectedBill.amount_due).toFixed(2)}</strong></p>
                  {selectedBill._totalPaid > 0 && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--secondary)', marginBottom: '0.5rem' }}>Already Paid: ₱{Number(selectedBill._totalPaid).toFixed(2)}</p>
                  )}
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--warning)' }}>Remaining Balance: ₱{Number(selectedBill._remaining || selectedBill.amount_due).toFixed(2)}</p>
                </div>
                <div className="form-group">
                  <label className="form-label">Amount to Pay (₱)</label>
                  <input type="number" step="0.01" min="0.01" max={selectedBill._remaining || selectedBill.amount_due} className="form-input" required value={payForm.amount_paid} onChange={e => setPayForm({ ...payForm, amount_paid: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPayModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: 'var(--secondary)' }}>Confirm Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Bill Modal */}
      {showAdjustModal && selectedAdjustBill && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Adjust Reading</h3>
              <button className="close-btn" onClick={() => setShowAdjustModal(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <form onSubmit={handleAdjustSubmit}>
              <div className="modal-body">
                <div style={{ marginBottom: '1rem', backgroundColor: 'var(--bg-color)', padding: '1rem', borderRadius: '4px' }}>
                  <strong>Consumer:</strong> {selectedAdjustBill.consumer_name}<br />
                  <strong>Billing Month:</strong> {selectedAdjustBill.billing_month}<br />
                  <strong>Previous Reading:</strong> {selectedAdjustBill.previous_reading}
                </div>
                
                <div className="form-group">
                  <label className="form-label">New Current Reading</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    required 
                    value={adjustForm.current_reading} 
                    onChange={e => setAdjustForm({ ...adjustForm, current_reading: e.target.value })} 
                  />
                  <small style={{ color: 'var(--text-muted)' }}>Must be {'>='} previous reading</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptData && (
        <Receipt data={receiptData} onClose={() => setReceiptData(null)} />
      )}

      {/* Bill Notice Modal */}
      {billNoticeId && (
        <BillNotice billId={billNoticeId} onClose={() => setBillNoticeId(null)} />
      )}

      {/* Toasts */}
      <div className="toast-container print-hide">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Billing;
