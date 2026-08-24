import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const API = '';

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetchWithAuth('/api/dashboard');
        if (!response.ok) throw new Error('Failed to fetch dashboard data');
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="card">
          <p style={{ color: 'var(--danger)' }}>Error: {error}</p>
        </div>
      </div>
    );
  }

  const stats = data || { total_consumers: 0, total_billed: 0, total_collected: 0, total_pending: 0, collection_rate: '0%', recent_billings: [] };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard Overview</h1>
      </div>

      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="card stat-card primary">
          <div className="stat-header">
            <span className="stat-title">Total Consumers</span>
            <svg className="stat-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div className="stat-value">{stats.total_consumers}</div>
          <div className="stat-desc">Active connections</div>
        </div>

        <div className="card stat-card warning">
          <div className="stat-header">
            <span className="stat-title">Total Billed</span>
            <svg className="stat-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          </div>
          <div className="stat-value">₱{Number(stats.total_billed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="stat-desc">All time</div>
        </div>

        <div className="card stat-card success">
          <div className="stat-header">
            <span className="stat-title">Total Collected</span>
            <svg className="stat-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div className="stat-value">₱{Number(stats.total_collected || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="stat-desc">{stats.collection_rate} collection rate</div>
        </div>

        <div className="card stat-card danger">
          <div className="stat-header">
            <span className="stat-title">Pending Collections</span>
            <svg className="stat-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div className="stat-value">₱{Number(stats.total_pending || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="stat-desc">Unpaid balance</div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Recent Billings</h2>
        {stats.recent_billings && stats.recent_billings.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Consumer</th>
                  <th>Month</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_billings.map((bill) => (
                  <tr key={bill.id}>
                    <td>{bill.consumer_name}</td>
                    <td>{bill.billing_month}</td>
                    <td>₱{Number(bill.amount_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`badge ${bill.status.toLowerCase()}`}>
                        {bill.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No recent billings found.</div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
