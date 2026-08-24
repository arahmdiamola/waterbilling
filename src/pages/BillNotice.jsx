import { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';
import { QRCodeSVG } from 'qrcode.react';

function BillNotice({ billId, billData, onClose }) {
  const [data, setData] = useState(billData || null);
  const [loading, setLoading] = useState(!billData);

  useEffect(() => {
    if (billData) {
      setData(billData);
      return;
    }
    if (!billId) return;

    fetchWithAuth(`/api/billings/${billId}/notice`)
      .then(res => res.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [billId, billData]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-card" style={{ maxWidth: '400px' }}>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tenantName = (data.tenant_name || 'WATER BILLING SYSTEM').toUpperCase();
  const consumerName = data.consumer_name || 'N/A';
  const address = data.consumer_address || data.address || 'N/A';
  const meterNumber = data.meter_number || 'N/A';
  const billingMonth = data.billing_month || 'N/A';
  const prevReading = Number(data.previous_reading || 0);
  const currReading = Number(data.current_reading || 0);
  const consumption = Number(data.consumption || 0);
  const amountDue = Number(data.amount_due || 0);
  const dueDate = data.due_date
    ? new Date(data.due_date + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';
  const minCubic = Number(data.minimum_cubic_meters || 0);
  const minCharge = Number(data.minimum_charge || 0);
  const succeedingRate = Number(data.rate_per_cubic_meter || 0);
  const isFlatRate = data.billing_type === 'FLAT';

  // Format billing month
  let monthDisplay = billingMonth;
  if (billingMonth && billingMonth.includes('-')) {
    const [y, m] = billingMonth.split('-');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    monthDisplay = `${monthNames[parseInt(m) - 1]} ${y}`;
  }

  return (
    <div className="modal-overlay receipt-modal-overlay">
      <div className="modal-card" style={{ maxWidth: '400px' }}>
        <div className="modal-header print-hide">
          <h3 className="modal-title">Water Bill Notice</h3>
          <button className="close-btn" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="receipt-paper">
            <div className="receipt-center">
              <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{tenantName}</div>
              <div>WATER BILLING NOTICE</div>
            </div>
            <div className="receipt-separator">================================</div>

            <div style={{ fontWeight: 'bold', fontSize: '1.05em', marginBottom: '2px' }}>{consumerName}</div>
            <div>{address}</div>
            {!isFlatRate && <div>Meter #: {meterNumber}</div>}

            <div className="receipt-separator">================================</div>

            <div className="receipt-center" style={{ fontWeight: 'bold' }}>
              <div>BILLING FOR {monthDisplay.toUpperCase()}</div>
            </div>

            <div className="receipt-separator">--------------------------------</div>

            {!isFlatRate && (
              <>
                <div className="receipt-row">
                  <span>Previous Reading:</span>
                  <span>{prevReading.toFixed(1)}</span>
                </div>
                <div className="receipt-row">
                  <span>Current Reading:</span>
                  <span>{currReading.toFixed(1)}</span>
                </div>
                <div className="receipt-row" style={{ fontWeight: 'bold' }}>
                  <span>Consumption:</span>
                  <span>{consumption.toFixed(1)} m³</span>
                </div>
              </>
            )}
            {isFlatRate && (
              <div className="receipt-row" style={{ fontWeight: 'bold' }}>
                <span>Flat Rate Charge:</span>
                <span>₱ {amountDue.toFixed(2)}</span>
              </div>
            )}

            <div className="receipt-separator">--------------------------------</div>

            {!isFlatRate && minCubic > 0 && (
              <>
                <div className="receipt-row">
                  <span>Min. ({minCubic} m³):</span>
                  <span>₱ {minCharge.toFixed(2)}</span>
                </div>
                {consumption > minCubic && (
                  <div className="receipt-row">
                    <span>Excess {(consumption - minCubic).toFixed(1)} m³:</span>
                    <span>₱ {((consumption - minCubic) * succeedingRate).toFixed(2)}</span>
                  </div>
                )}
                <div className="receipt-separator">--------------------------------</div>
              </>
            )}

            <div className="receipt-row" style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
              <span>AMOUNT DUE:</span>
              <span>₱ {amountDue.toFixed(2)}</span>
            </div>

            <div className="receipt-separator">================================</div>

            <div className="receipt-row" style={{ fontWeight: 'bold' }}>
              <span>DUE DATE:</span>
              <span>{dueDate}</span>
            </div>

            <div className="receipt-separator">--------------------------------</div>

            <div className="receipt-center" style={{ marginTop: '12px' }}>
              <div style={{ background: 'white', padding: '4px', display: 'inline-block' }}>
                <QRCodeSVG 
                  value={`WBP-${data.consumer_id}`} 
                  size={64}
                  bgColor={"#ffffff"}
                  fgColor={"#000000"}
                  level={"M"}
                />
              </div>
              <div style={{ fontSize: '0.7em', marginTop: '2px' }}>Scan to pay</div>
            </div>

            <div className="receipt-separator" style={{ marginTop: '12px' }}>================================</div>
            <div className="receipt-center">
              Please pay on or before<br />
              <strong>{dueDate}</strong>
              <div style={{ marginTop: '4px' }}>Thank you!</div>
            </div>
          </div>
        </div>

        <div className="modal-footer print-hide">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handlePrint}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Print Bill
          </button>
        </div>
      </div>
    </div>
  );
}

export default BillNotice;
