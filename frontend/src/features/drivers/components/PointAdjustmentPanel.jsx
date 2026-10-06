import { useState } from 'react';

import { adjustDriverPoints } from '../../../api';

const MAX_ADJUSTMENT = 1_000_000;
const MAX_REASON_LENGTH = 500;

function firstError(error, field) {
  const value = error.data?.[field];
  return Array.isArray(value) ? value[0] : value;
}

export default function PointAdjustmentPanel({ driverId, balance, onAdjusted }) {
  const [mode, setMode] = useState('award');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setErrors({});
    setNotice('');
    setConfirming(false);
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
      setConfirming(false);
      return;
    }
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
        ? `${values.numericAmount.toLocaleString()} points awarded.`
        : `${values.numericAmount.toLocaleString()} points deducted.`);
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
    <section className="point-adjustment" aria-labelledby="point-adjustment-heading">
      <div className="point-adjustment-heading">
        <div><h2 id="point-adjustment-heading">Adjust points</h2><p>A reason is recorded with every change.</p></div>
        <strong aria-label={`Current balance: ${balance.toLocaleString()} points`}>{balance.toLocaleString()} pts</strong>
      </div>
      <div className="point-adjustment-tabs" role="group" aria-label="Adjustment type">
        <button type="button" className={mode === 'award' ? 'active' : ''} aria-pressed={mode === 'award'} onClick={() => changeMode('award')}>Award</button>
        <button type="button" className={mode === 'deduct' ? 'active' : ''} aria-pressed={mode === 'deduct'} onClick={() => changeMode('deduct')}>Deduct</button>
      </div>
      {notice && <p className="point-adjustment-notice" role="status">{notice}</p>}
      {errors.detail && <p className="point-adjustment-error" role="alert">{errors.detail}</p>}
      <form onSubmit={submit} noValidate>
        <label htmlFor="point-amount">Points</label>
        <input id="point-amount" type="number" min="1" max={MAX_ADJUSTMENT} step="1" inputMode="numeric" value={amount} onChange={(event) => { setAmount(event.target.value); setErrors((current) => ({ ...current, amount: undefined })); setConfirming(false); }} disabled={saving} aria-invalid={Boolean(errors.amount)} />
        {errors.amount && <small className="point-field-error">{errors.amount}</small>}
        <label htmlFor="point-reason">Reason</label>
        <textarea id="point-reason" maxLength={MAX_REASON_LENGTH} value={reason} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: undefined })); setConfirming(false); }} disabled={saving} aria-invalid={Boolean(errors.reason)} />
        <div className="point-reason-meta"><small className={errors.reason ? 'point-field-error' : ''}>{errors.reason || 'Required. This will appear in the transaction history.'}</small><small>{reason.length}/{MAX_REASON_LENGTH}</small></div>
        {confirming && (
          <div className="point-confirmation" role="alertdialog" aria-labelledby="point-confirmation-title">
            <strong id="point-confirmation-title">Confirm point deduction</strong>
            <p>Deduct {Number(amount).toLocaleString()} points? The new balance will be {(balance - Number(amount)).toLocaleString()}.</p>
            <button type="button" onClick={() => setConfirming(false)} disabled={saving}>Go back</button>
            <button className="danger" type="submit" disabled={saving}>{saving ? 'Deducting…' : 'Confirm deduction'}</button>
          </div>
        )}
        {!confirming && <button className={mode === 'deduct' ? 'danger' : 'primary'} type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'award' ? 'Award points' : 'Review deduction'}</button>}
      </form>
    </section>
  );
}
