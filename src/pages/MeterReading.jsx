import { useState, useEffect, useMemo } from 'react';
import { fetchWithAuth } from '../utils/api';
import BillNotice from './BillNotice';
import { useSettings } from '../utils/SettingsContext';

function MeterReading() {
  const { isFlat, flatRate } = useSettings();
  const [consumers, setConsumers] = useState([]);
  const [readings, setReadings] = useState({}); // { consumerId: currentReading }
  const [selectedConsumers, setSelectedConsumers] = useState({});
  const [billingMonth, setBillingMonth] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rateConfig, setRateConfig] = useState({ rate: 0, minCubic: 0, minCharge: 0 });
  const [toasts, setToasts] = useState([]);
  const [result, setResult] = useState(null);
  const [billNoticeId, setBillNoticeId] = useState(null);
  const [importFile, setImportFile] = useState(null);

  const handleSelectAll = (checked) => {
    const newSelected = {};
    for (const c of consumers) {
      if (!c.already_billed) {
        newSelected[c.id] = checked;
      }
    }
    setSelectedConsumers(newSelected);
  };

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Set default billing month to current month
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setBillingMonth(`${y}-${m}`);

    // Set default due date to 15th of next month
    const nextMonth = new Date(y, now.getMonth() + 1, 15);
    setDueDate(nextMonth.toISOString().split('T')[0]);

    // Fetch rate config
    fetchWithAuth('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data) {
          setRateConfig({
            rate: data.rate_per_cubic_meter || 0,
            minCubic: data.minimum_cubic_meters || 0,
            minCharge: data.minimum_charge || 0
          });
        }
      })
      .catch(() => {});
  }, []);

  // Fetch consumers with readings whenever billing month changes
  useEffect(() => {
    if (!billingMonth) return;
    setLoading(true);
    setResult(null);
    fetchWithAuth(`/api/consumers/readings?month=${billingMonth}`)
      .then(res => res.json())
      .then(data => {
        setConsumers(data);
        setReadings({}); // Reset readings when month changes
      })
      .catch(() => addToast('Failed to load consumers', 'error'))
      .finally(() => setLoading(false));
  }, [billingMonth]);

  // Filter consumers by search
  const filteredConsumers = useMemo(() => {
    if (!search) return consumers;
    const term = search.toLowerCase();
    
    // Hardware Scanner Support (WBP-ID format)
    if (term.startsWith('wbp-')) {
      const idStr = term.replace('wbp-', '');
      return consumers.filter(c => String(c.id) === idStr);
    }
    
    return consumers.filter(c =>
      c.name?.toLowerCase().includes(term) ||
      c.meter_number?.toLowerCase().includes(term) ||
      c.address?.toLowerCase().includes(term)
    );
  }, [consumers, search]);

  // Auto-focus input when a consumer is scanned
  useEffect(() => {
    if (search.toLowerCase().startsWith('wbp-') && filteredConsumers.length === 1) {
      const consumerId = filteredConsumers[0].id;
      setTimeout(() => {
        const input = document.getElementById(`reading-input-${consumerId}`);
        if (input) {
          input.focus();
          // Select existing value to make it easy to overwrite
          input.select();
        }
      }, 50);
    }
  }, [search, filteredConsumers]);

  // Calculate amount using tiered rate
  const calcAmount = (consumption) => {
    if (consumption <= rateConfig.minCubic) {
      return rateConfig.minCharge;
    }
    return rateConfig.minCharge + (consumption - rateConfig.minCubic) * rateConfig.rate;
  };

  // Stats
  const stats = useMemo(() => {
    if (isFlat) {
      const selected = consumers.filter(c => !c.already_billed && selectedConsumers[c.id]);
      return {
        entered: selected.length,
        totalAmount: selected.length * flatRate,
        totalConsumption: 0
      };
    }
    let entered = 0;
    let totalAmount = 0;
    let totalConsumption = 0;

    for (const c of consumers) {
      if (c.already_billed) continue;
      const val = readings[c.id];
      if (val !== undefined && val !== '') {
        const curr = parseFloat(val);
        const prev = c.last_reading || 0;
        if (!isNaN(curr) && curr >= prev) {
          entered++;
          const consumption = curr - prev;
          totalConsumption += consumption;
          totalAmount += calcAmount(consumption);
        }
      }
    }

    return { entered, totalAmount, totalConsumption };
  }, [consumers, readings, rateConfig, isFlat, flatRate, selectedConsumers]);

  const handleReadingChange = (consumerId, value) => {
    setReadings(prev => ({ ...prev, [consumerId]: value }));
  };

  const handleSubmit = async () => {
    if (stats.entered === 0) {
      addToast(isFlat ? 'Please select at least one consumer' : 'Please enter at least one current reading', 'error');
      return;
    }

    if (!billingMonth) {
      addToast('Please select a billing month', 'error');
      return;
    }

    const readingsArray = [];
    if (isFlat) {
      for (const c of consumers) {
        if (c.already_billed) continue;
        if (selectedConsumers[c.id]) {
          readingsArray.push({
            consumer_id: c.id,
            previous_reading: 0,
            current_reading: 0
          });
        }
      }
    } else {
      for (const c of consumers) {
        if (c.already_billed) continue;
        const val = readings[c.id];
        if (val !== undefined && val !== '') {
          const curr = parseFloat(val);
          const prev = c.last_reading || 0;
          if (!isNaN(curr) && curr >= prev) {
            readingsArray.push({
              consumer_id: c.id,
              previous_reading: prev,
              current_reading: curr
            });
          }
        }
      }
    }

    setSubmitting(true);
    try {
      const response = await fetchWithAuth('/api/billings/batch', {
        method: 'POST',
        body: JSON.stringify({
          billing_month: billingMonth,
          due_date: dueDate,
          readings: readingsArray
        })
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
        addToast(`${data.generated} bills generated successfully!`);
        // Refresh the consumer list to update already_billed flags
        const refreshRes = await fetchWithAuth(`/api/consumers/readings?month=${billingMonth}`);
        if (refreshRes.ok) {
          setConsumers(await refreshRes.json());
          setReadings({});
          setSelectedConsumers({});
        }
      } else {
        const err = await response.json();
        addToast(err.error || 'Failed to generate bills', 'error');
      }
    } catch (err) {
      addToast('Network error during batch generation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getRowCalculation = (consumer) => {
    if (consumer.already_billed) return { consumption: null, amount: null, status: 'billed' };
    if (isFlat) {
      return selectedConsumers[consumer.id]
        ? { consumption: null, amount: flatRate, status: 'valid' }
        : { consumption: null, amount: null, status: 'empty' };
    }
    const val = readings[consumer.id];
    if (val === undefined || val === '') return { consumption: null, amount: null, status: 'empty' };
    const curr = parseFloat(val);
    const prev = consumer.last_reading || 0;
    if (isNaN(curr)) return { consumption: null, amount: null, status: 'invalid' };
    if (curr < prev) return { consumption: null, amount: null, status: 'error' };
    const consumption = curr - prev;
    const amount = calcAmount(consumption);
    return { consumption, amount, status: 'valid' };
  };

  const unbilledCount = consumers.filter(c => !c.already_billed).length;
  const billedCount = consumers.filter(c => c.already_billed).length;

  const handleDownloadSheet = () => {
    if (!billingMonth) {
      addToast('Please select a billing month first', 'error');
      return;
    }
    const token = localStorage.getItem('token');
    window.open(`/api/readings/offline-sheet?month=${billingMonth}&token=${token}`, '_blank');
  };

  const handleImportReadings = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.readings || !Array.isArray(data.readings)) {
        addToast('Invalid file format. Expected a readings JSON file.', 'error');
        return;
      }

      // If the file has a billing_month, update our billing month to match
      if (data.billing_month && data.billing_month !== billingMonth) {
        setBillingMonth(data.billing_month);
      }

      // Populate the readings into the form
      const newReadings = {};
      let count = 0;
      for (const r of data.readings) {
        newReadings[r.consumer_id] = String(r.current_reading);
        count++;
      }
      setReadings(prev => ({ ...prev, ...newReadings }));
      addToast(`Imported ${count} readings from offline sheet!`);
    } catch (err) {
      addToast('Failed to read file. Make sure it is a valid JSON file.', 'error');
    }
    // Reset file input so the same file can be re-selected
    e.target.value = '';
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{isFlat ? 'Monthly Billing' : 'Meter Reading'}</h1>
        <div className="header-actions">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>
            {consumers.length} consumers • {billedCount > 0 && <span style={{ color: 'var(--secondary)' }}>{billedCount} already billed</span>}
          </span>
          {!isFlat && (
            <>
              <button className="btn btn-secondary" onClick={handleDownloadSheet} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Offline Sheet
              </button>
              <label className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', cursor: 'pointer', marginBottom: 0 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                Import Readings
                <input type="file" accept=".json" onChange={handleImportReadings} style={{ display: 'none' }} />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
            <label className="form-label">Billing Month</label>
            <input
              type="month"
              className="form-input"
              value={billingMonth}
              onChange={e => setBillingMonth(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
            <label className="form-label">Due Date</label>
            <input
              type="date"
              className="form-input"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '2 1 250px' }}>
            <label className="form-label">Search Consumer</label>
            <div className="search-bar" style={{ marginBottom: 0 }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                type="text"
                placeholder={isFlat ? 'Search consumer name...' : 'Scan QR or filter name/meter...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Result Banner */}
      {result && (
        <div className="card" style={{ marginBottom: '1.5rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <div>
              <p style={{ fontWeight: 600, color: 'var(--secondary)', marginBottom: '0.25rem' }}>
                Bills Generated Successfully!
              </p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {result.generated} bills created • Total Amount: ₱{Number(result.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {result.errors?.length > 0 && ` • ${result.errors.length} errors`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Readings Table */}
      <div className="card">
        {loading ? (
          <div className="loading-spinner"></div>
        ) : filteredConsumers.length > 0 ? (
          <>
            <div className="table-container" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    {isFlat && <th style={{ width: '5%' }}><input type="checkbox" onChange={e => handleSelectAll(e.target.checked)} /></th>}
                    <th style={{ width: isFlat ? '40%' : '30%' }}>Consumer</th>
                    {!isFlat && <th style={{ width: '12%' }}>Meter #</th>}
                    {!isFlat && <th style={{ width: '14%' }}>Prev. Reading</th>}
                    {!isFlat ? <th style={{ width: '16%' }}>Current Reading</th> : null}
                    {!isFlat && <th style={{ width: '14%' }}>Consumption</th>}
                    <th style={{ width: '14%' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConsumers.map(consumer => {
                    const calc = getRowCalculation(consumer);
                    const isBilled = consumer.already_billed;

                    return (
                      <tr
                        key={consumer.id}
                        style={{
                          opacity: isBilled ? 0.45 : 1,
                          background: calc.status === 'error' ? 'rgba(244, 63, 94, 0.06)' :
                                      calc.status === 'valid' ? 'rgba(16, 185, 129, 0.04)' : undefined
                        }}
                      >
                        {isFlat && (
                          <td>
                            {!isBilled && (
                              <input
                                type="checkbox"
                                checked={!!selectedConsumers[consumer.id]}
                                onChange={e => setSelectedConsumers(prev => ({ ...prev, [consumer.id]: e.target.checked }))}
                              />
                            )}
                          </td>
                        )}
                        <td>
                          <div style={{ fontWeight: 500 }}>{consumer.name}</div>
                          {consumer.address && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{consumer.address}</div>
                          )}
                        </td>
                        {!isFlat && <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{consumer.meter_number}</td>}
                        {!isFlat && (
                          <td>
                            <span style={{ fontFamily: 'monospace' }}>{consumer.last_reading ?? 0}</span>
                            {consumer.last_billing_month && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
                                from {consumer.last_billing_month}
                              </span>
                            )}
                          </td>
                        )}
                        {!isFlat && (
                          <td>
                            {isBilled ? (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                                onClick={() => setBillNoticeId(consumer.billed_id)}
                              >
                                Print Bill
                              </button>
                            ) : (
                              <input
                                id={`reading-input-${consumer.id}`}
                                type="number"
                                step="0.01"
                                className="form-input"
                                style={{
                                  padding: '0.4rem 0.5rem',
                                  fontSize: '0.875rem',
                                  fontFamily: 'monospace',
                                  margin: 0,
                                  borderColor: calc.status === 'error' ? 'var(--danger)' : undefined
                                }}
                                placeholder={String(consumer.last_reading || 0)}
                                value={readings[consumer.id] ?? ''}
                                onChange={e => handleReadingChange(consumer.id, e.target.value)}
                              />
                            )}
                          </td>
                        )}
                        {!isFlat && (
                          <td>
                            {calc.status === 'valid' && (
                              <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                                {calc.consumption.toFixed(1)} m³
                              </span>
                            )}
                            {calc.status === 'error' && (
                              <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>Invalid</span>
                            )}
                          </td>
                        )}
                        <td>
                          {calc.status === 'valid' && (
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              ₱{calc.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          {isFlat && isBilled && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                              onClick={() => setBillNoticeId(consumer.billed_id)}
                            >
                              Print Bill
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Summary + Submit */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1.5rem',
              padding: '1rem',
              borderRadius: '0.75rem',
              background: 'rgba(99, 102, 241, 0.06)',
              border: '1px solid rgba(99, 102, 241, 0.15)',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>{isFlat ? 'Consumers Selected' : 'Readings Entered'}</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{stats.entered} / {unbilledCount}</span>
                </div>
                {!isFlat && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Consumption</span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{stats.totalConsumption.toFixed(1)} m³</span>
                  </div>
                )}
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Total Amount</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--secondary)' }}>
                    ₱{stats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <button
                className="btn btn-primary"
                disabled={stats.entered === 0 || submitting}
                onClick={handleSubmit}
                style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
              >
                {submitting ? (
                  <>
                    <div className="loading-spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Generate {stats.entered} Bill{stats.entered !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            {consumers.length === 0
              ? 'No consumers found. Add consumers first.'
              : 'No consumers match your search.'}
          </div>
        )}
      </div>

      {/* Bill Notice Modal */}
      {billNoticeId && (
        <BillNotice billId={billNoticeId} onClose={() => setBillNoticeId(null)} />
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

export default MeterReading;
