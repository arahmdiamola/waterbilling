function Receipt({ data, onClose }) {
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  const receiptNo = data.receipt_number || `WB-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-0001`;
  const paymentDate = data.payment_date ? new Date(data.payment_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const amountDue = Number(data.amount_due || 0);
  const amountPaid = Number(data.amount_paid || 0);
  const remainingBalance = Number(data.remaining_balance || Math.max(0, amountDue - amountPaid));
  const paymentType = data.payment_type || (remainingBalance > 0 ? 'PARTIAL' : 'FULL');
  const tenantName = data.tenant_name || 'WATER BILLING SYSTEM';
  const isFlatRate = data.billing_type === 'FLAT';

  return (
    <div className="modal-overlay receipt-modal-overlay">
      <div className="modal-card" style={{ maxWidth: '400px' }}>
        <div className="modal-header print-hide">
          <h3 className="modal-title">Payment Receipt</h3>
          <button className="close-btn" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="receipt-paper">
            <div className="receipt-center">
              <div style={{ fontWeight: 'bold' }}>{tenantName.toUpperCase()}</div>
              <div>Water Billing System</div>
              <div>Official Receipt</div>
            </div>
            <div className="receipt-separator">================================</div>
            <div>Receipt #: {receiptNo}</div>
            <div>Date: {paymentDate}</div>
            <div className="receipt-separator">================================</div>
            <div>Consumer: {data.consumer_name || 'N/A'}</div>
            <div>Address: {data.consumer_address || data.address || 'N/A'}</div>
            {!isFlatRate && <div>Meter #: {data.meter_number || 'N/A'}</div>}
            <div className="receipt-separator">--------------------------------</div>
            <div>Billing Month: {data.billing_month || 'N/A'}</div>
            {!isFlatRate && data.previous_reading != null && (
              <div className="receipt-row">
                <span>Prev Reading:</span>
                <span>{Number(data.previous_reading).toFixed(2)}</span>
              </div>
            )}
            {!isFlatRate && data.current_reading != null && (
              <div className="receipt-row">
                <span>Curr Reading:</span>
                <span>{Number(data.current_reading).toFixed(2)}</span>
              </div>
            )}
            {!isFlatRate && data.consumption != null && (
              <div className="receipt-row">
                <span>Consumption:</span>
                <span>{Number(data.consumption).toFixed(2)} m³</span>
              </div>
            )}
            {isFlatRate && (
              <div className="receipt-row">
                <span>Billing Type:</span>
                <span>Flat Rate</span>
              </div>
            )}
            <div className="receipt-separator">--------------------------------</div>
            <div className="receipt-row">
              <span>Amount Due:</span>
              <span>₱ {amountDue.toFixed(2)}</span>
            </div>
            <div className="receipt-row">
              <span>Amount Paid:</span>
              <span>₱ {amountPaid.toFixed(2)}</span>
            </div>
            {data.total_paid_for_bill != null && data.total_paid_for_bill !== amountPaid && (
              <div className="receipt-row">
                <span>Total Paid:</span>
                <span>₱ {Number(data.total_paid_for_bill).toFixed(2)}</span>
              </div>
            )}
            <div className="receipt-row">
              <span>Balance:</span>
              <span>₱ {remainingBalance.toFixed(2)}</span>
            </div>
            <div>Payment Type: {paymentType}</div>
            <div className="receipt-separator">================================</div>
            <div className="receipt-center">
              <div>Thank you for your payment!</div>
              <div>Please keep this receipt.</div>
            </div>
          </div>
        </div>

        <div className="modal-footer print-hide">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={handlePrint}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

export default Receipt;
