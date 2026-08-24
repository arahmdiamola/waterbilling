import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';
import { useSettings } from '../utils/SettingsContext';

const API = '';

function Reports() {
  const { isFlat } = useSettings();
  const [activeTab, setActiveTab] = useState('summary');

  const [consumers, setConsumers] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [agingData, setAgingData] = useState(null);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [consumerId, setConsumerId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWithAuth('/api/consumers')
      .then(res => res.json())
      .then(data => setConsumers(data))
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (activeTab === 'summary') fetchSummary();
    else if (activeTab === 'ledger' && consumerId) fetchLedger();
    else if (activeTab === 'aging') fetchAging();
  }, [activeTab, month, consumerId]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/reports/collection-summary?month=${month}`);
      if (res.ok) setSummaryData(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLedger = async () => {
    if (!consumerId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/reports/consumer-ledger?consumer_id=${consumerId}`);
      if (res.ok) setLedgerData(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAging = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/reports/aging');
      if (res.ok) {
        const result = await res.json();
        setAgingData(result.aging || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => { window.print(); };

  return (
    <div className="report-printable">
      <div className="page-header print-hide">
        <h1 className="page-title">Reports</h1>
      </div>

      <div className="tabs print-hide" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button className={`tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>Collection Summary</button>
          <button className={`tab ${activeTab === 'ledger' ? 'active' : ''}`} onClick={() => setActiveTab('ledger')}>Consumer Ledger</button>
          <button className={`tab ${activeTab === 'aging' ? 'active' : ''}`} onClick={() => setActiveTab('aging')}>Aging Report</button>
        </div>
        <button className="btn btn-secondary" onClick={handlePrint}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print Report
        </button>
      </div>

      <div className="card">
        {/* Collection Summary Tab */}
        {activeTab === 'summary' && (
          <div>
            <div className="report-header">
              <h2 className="card-title" style={{ margin: 0 }}>Collection Summary</h2>
              <div className="print-hide">
                <input type="month" className="form-input" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
            </div>

            {loading ? <div className="loading-spinner"></div> : summaryData ? (
              <>
                <div className="report-summary-grid">
                  <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', borderLeft: '4px solid var(--warning)' }}>
                    <div className="stat-title">Total Billed</div>
                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>₱{Number(summaryData.total_billed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', borderLeft: '4px solid var(--secondary)' }}>
                    <div className="stat-title">Total Collected</div>
                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>₱{Number(summaryData.total_collected || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', borderLeft: '4px solid var(--danger)' }}>
                    <div className="stat-title">Pending</div>
                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>₱{Number(summaryData.total_pending || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '0.5rem', borderLeft: '4px solid var(--info)' }}>
                    <div className="stat-title">Collection Rate</div>
                    <div className="stat-value" style={{ fontSize: '1.5rem' }}>{summaryData.collection_rate}</div>
                  </div>
                </div>

                {summaryData.bills && summaryData.bills.length > 0 ? (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Consumer</th>
                          <th>Amount Due</th>
                          <th>Amount Paid</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.bills.map((d, i) => (
                          <tr key={i}>
                            <td>{d.consumer_name}</td>
                            <td>₱{Number(d.amount_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td>₱{Number(d.amount_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td><span className={`badge ${d.status.toLowerCase()}`}>{d.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="empty-state">No records for this month.</div>}
              </>
            ) : <div className="empty-state">Select a month to view summary.</div>}
          </div>
        )}

        {/* Consumer Ledger Tab */}
        {activeTab === 'ledger' && (
          <div>
            <div className="report-header">
              <h2 className="card-title" style={{ margin: 0 }}>Consumer Ledger</h2>
              <div className="print-hide">
                <select className="form-input" value={consumerId} onChange={(e) => setConsumerId(e.target.value)}>
                  <option value="">Select Consumer...</option>
                  {consumers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {loading ? <div className="loading-spinner"></div> : ledgerData ? (
              <>
                <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem' }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem' }}>{ledgerData.consumer.name}</h3>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>{!isFlat && <>Meter: {ledgerData.consumer.meter_number || 'N/A'} | </>}Address: {ledgerData.consumer.address || 'N/A'}</p>
                </div>

                {ledgerData.ledger && ledgerData.ledger.length > 0 ? (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Billing Month</th>
                          {!isFlat && <th>Consumption</th>}
                          <th>Amount Due</th>
                          <th>Amount Paid</th>
                          <th>Balance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerData.ledger.map((entry, i) => (
                          <tr key={i}>
                            <td>{entry.billing_month}</td>
                            {!isFlat && <td>{entry.consumption != null ? `${Number(entry.consumption).toFixed(1)} m³` : 'N/A'}</td>}
                            <td>₱{Number(entry.amount_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td>₱{Number(entry.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td style={{ fontWeight: 600, color: entry.balance > 0 ? 'var(--danger)' : 'var(--secondary)' }}>₱{Number(entry.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td><span className={`badge ${entry.status.toLowerCase()}`}>{entry.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <div className="empty-state">No ledger entries found.</div>}
              </>
            ) : <div className="empty-state">Select a consumer to view ledger.</div>}
          </div>
        )}

        {/* Aging Report Tab */}
        {activeTab === 'aging' && (
          <div>
            <div className="report-header">
              <h2 className="card-title" style={{ margin: 0 }}>Aging Report (Unpaid Accounts)</h2>
            </div>

            {loading ? <div className="loading-spinner"></div> : agingData && agingData.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Consumer</th>
                      <th>Total Unpaid</th>
                      <th>Oldest Unpaid Month</th>
                      <th>Months Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingData.map((record, i) => (
                      <tr key={i} className={record.months_overdue >= 3 ? 'aging-row-severe' : ''}>
                        <td>{record.consumer_name}</td>
                        <td style={{ fontWeight: 500, color: 'var(--danger)' }}>₱{Number(record.total_unpaid).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>{record.oldest_unpaid_month}</td>
                        <td>
                          {record.months_overdue >= 3 ? (
                            <span className="badge danger">{record.months_overdue} Months</span>
                          ) : (
                            <span>{record.months_overdue} Month{record.months_overdue !== 1 ? 's' : ''}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-state">No unpaid accounts found.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default Reports;
