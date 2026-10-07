import { useState } from 'react';

import { adjustDriverPoints } from '../../../api';

const MAX_ADJUSTMENT = 1_000_000;
const MAX_REASON_LENGTH = 500;

function firstError(error, field) {
  const value = error.data?.[field];
  return Array.isArray(value) ? value[0] : value;
}

export default function PointAdjustmentPanel({ driverId, driverName, balance, onAdjusted }) {
  const [mode, setMode] = useState('award');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationFailed, setValidationFailed] = useState(false);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setNotice('');
    setConfirming(false);
    setValidationFailed(false);
  };

  const validate = () => {
    const nextErrors = {};
    const numericAmount = Number(amount);
    if (!/^\d+$/.test(amount) || !Number.isSafeInteger(numericAmount) || numericAmount < 1) {
      nextErrors.amount = 'Enter a whole number greater than zero.';
    } else if (numericAmount > MAX_ADJUSTMENT) {
      nextErrors.amount = `Enter ${MAX_ADJUSTMENT.toLocaleString()} points or fewer.`;
    } else if (mode === 'deduct' && numericAmount > balance) {
      nextErrors.amount = `This driver only has ${balance.toLocaleString()} points available.`;
    }
    const cleanedReason = reason.trim().replace(/\s+/g, ' ');
    if (!cleanedReason) nextErrors.reason = 'Enter a reason for this adjustment.';
    else if (cleanedReason.length > MAX_REASON_LENGTH) nextErrors.reason = `Use ${MAX_REASON_LENGTH} characters or fewer.`;
    setErrors(nextErrors);
    return { valid: Object.keys(nextErrors).length === 0, numericAmount, cleanedReason };
  };

  const submit = async (event) => {
    event.preventDefault();
    setNotice('');
    const values = validate();
    if (!values.valid) {
      setValidationFailed(true);
      setConfirming(false);
      return;
    }
    setValidationFailed(false);
    if (mode === 'deduct' && !confirming) {
      setConfirming(true);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const signedAmount = mode === 'award' ? values.numericAmount : -values.numericAmount;
      const result = await adjustDriverPoints(driverId, signedAmount, values.cleanedReason);
      onAdjusted(result.balance);
      setAmount('');
      setReason('');
      setConfirming(false);
      setNotice(mode === 'award'
        ? `${values.numericAmount.toLocaleString()} points awarded. ${driverName || 'The driver'}'s balance is now ${result.balance.toLocaleString()} points.`
        : `${values.numericAmount.toLocaleString()} points deducted. ${driverName || 'The driver'}'s balance is now ${result.balance.toLocaleString()} points.`);
    } catch (error) {
      setErrors({
        amount: firstError(error, 'point_change'),
        reason: firstError(error, 'reason'),
        detail: firstError(error, 'detail') || error.message || 'The adjustment could not be saved.',
      });
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card point-adjustment" aria-labelledby="point-adjustment-heading">
      <header className="point-adjustment-heading">
        <h2 id="point-adjustment-heading">Adjust points</h2>
        <p>A reason is recorded with every change and shown in the driver&apos;s point history.</p>
      </header>
      <div className="point-adjustment-body">
        {notice && <p className="banner banner-success point-adjustment-banner" role="status">{notice}</p>}
        {errors.detail && <p className="banner banner-error point-adjustment-banner" role="alert">{errors.detail}</p>}
        {validationFailed && (
          <p className="banner banner-error point-adjustment-banner" role="alert">
            <strong>Nothing was saved.</strong> Fix the highlighted fields and try again.
          </p>
        )}
        <div className="point-adjustment-tabs" role="group" aria-label="Adjustment type">
          <button type="button" aria-pressed={mode === 'award'} onClick={() => changeMode('award')}>Award</button>
          <button type="button" className="deduct" aria-pressed={mode === 'deduct'} onClick={() => changeMode('deduct')}>Deduct</button>
        </div>
        <form onSubmit={submit} noValidate>
        <div className="point-adjustment-fields">
          <div className="point-adjustment-field">
            <label htmlFor="point-amount">Points</label>
            <input id="point-amount" type="text" inputMode="numeric" autoComplete="off" value={amount} onChange={(event) => { setAmount(event.target.value); setErrors((current) => ({ ...current, amount: undefined })); setValidationFailed(false); setConfirming(false); }} disabled={saving} aria-invalid={Boolean(errors.amount)} aria-describedby="point-amount-help" />
            <small id="point-amount-help" className={errors.amount ? 'point-field-error' : ''}>
              {errors.amount || `Enter a whole number from 1 to ${MAX_ADJUSTMENT.toLocaleString()}.${mode === 'deduct' ? ` ${balance.toLocaleString()} points are available.` : ''}`}
            </small>
          </div>
          <div className="point-adjustment-field">
            <label htmlFor="point-reason">Reason</label>
            <textarea id="point-reason" maxLength={MAX_REASON_LENGTH} value={reason} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: undefined })); setValidationFailed(false); setConfirming(false); }} disabled={saving} aria-invalid={Boolean(errors.reason)} aria-describedby="point-reason-help" />
            <div id="point-reason-help" className="point-reason-meta"><small className={errors.reason ? 'point-field-error' : ''}>{errors.reason || 'Required. This appears in the point history.'}</small><small>{reason.length}/{MAX_REASON_LENGTH}</small></div>
          </div>
        </div>
        {confirming && (
          <div className="point-confirmation" role="alertdialog" aria-labelledby="point-confirmation-title">
            <strong id="point-confirmation-title">Confirm point deduction</strong>
            <p>Deduct {Number(amount).toLocaleString()} points from {driverName || 'this driver'}? Their balance will go from {balance.toLocaleString()} to {(balance - Number(amount)).toLocaleString()} points.</p>
            <div className="point-confirmation-actions">
              <button type="button" onClick={() => setConfirming(false)} disabled={saving}>Go back</button>
              <button className="danger" type="submit" disabled={saving}>{saving ? 'Deducting…' : 'Confirm deduction'}</button>
            </div>
          </div>
        )}
        {!confirming && <div className="point-adjustment-submit"><button className={mode === 'deduct' ? 'danger' : 'primary'} type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'award' ? 'Award points' : 'Review deduction'}</button></div>}
        </form>
      </div>
    </section>
  );
}
