import { useCallback, useState } from 'react';

import { createBehavior, deleteBehavior, getBehaviors, updateBehavior } from 'api';
import { Skeleton } from 'components/feedback';
import useApiRequest from 'hooks/useApiRequest';
import { BEHAVIOR_KINDS, signedPoints } from './BehaviorList';

const MAX_POINTS = 1_000_000;
const MAX_DESCRIPTION_LENGTH = 200;

function firstError(error, field) {
  const value = error.data?.[field];
  return Array.isArray(value) ? value[0] : value;
}

function validate(description, points) {
  const errors = {};
  const cleaned = description.trim().replace(/\s+/g, ' ');
  if (!cleaned) errors.description = 'Describe this behavior.';
  else if (cleaned.length > MAX_DESCRIPTION_LENGTH)
    errors.description = `Use ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  const value = Number(points);
  if (!/^\d+$/.test(points) || value < 1 || value > MAX_POINTS)
    errors.point_value = `Enter a whole number from 1 to ${MAX_POINTS.toLocaleString()}.`;
  return { errors, values: { description: cleaned, point_value: value } };
}

/** Add or edit one behavior; `initial` is set when editing. */
function BehaviorForm({ kind, initial, onSave, onCancel }) {
  const [description, setDescription] = useState(initial?.description || '');
  const [points, setPoints] = useState(initial ? String(initial.point_value) : '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const idPrefix = `behavior-${initial?.id ?? `new-${kind}`}`;

  const submit = async (event) => {
    event.preventDefault();
    const { errors: nextErrors, values } = validate(description, points);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      await onSave({ kind, ...values });
      if (!initial) {
        setDescription('');
        setPoints('');
      }
    } catch (error) {
      setErrors({
        description: firstError(error, 'description'),
        point_value: firstError(error, 'point_value'),
        detail:
          firstError(error, 'kind') ||
          firstError(error, 'detail') ||
          (!error.data?.description && !error.data?.point_value
            ? error.message || 'The behavior could not be saved.'
            : undefined),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="points-behavior-form"
      aria-label={
        initial
          ? `Edit ${initial.description}`
          : `Add a behavior that ${kind === 'good' ? 'earns' : 'costs'} points`
      }
      onSubmit={submit}
      noValidate
    >
      <div className="points-behavior-field">
        <label htmlFor={`${idPrefix}-description`}>Behavior</label>
        <input
          id={`${idPrefix}-description`}
          type="text"
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder={kind === 'good' ? 'e.g. Clean roadside inspection' : 'e.g. Hard braking'}
          value={description}
          disabled={saving}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? `${idPrefix}-description-error` : undefined}
          onChange={(event) => setDescription(event.target.value)}
        />
        {errors.description && (
          <small className="points-field-error" id={`${idPrefix}-description-error`}>
            {errors.description}
          </small>
        )}
      </div>
      <div className="points-behavior-field points-behavior-points">
        <label htmlFor={`${idPrefix}-points`}>Points</label>
        <input
          id={`${idPrefix}-points`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={points}
          disabled={saving}
          aria-invalid={Boolean(errors.point_value)}
          aria-describedby={errors.point_value ? `${idPrefix}-points-error` : undefined}
          onChange={(event) => setPoints(event.target.value)}
        />
        {errors.point_value && (
          <small className="points-field-error" id={`${idPrefix}-points-error`}>
            {errors.point_value}
          </small>
        )}
      </div>
      <div className="points-behavior-form-actions">
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save' : 'Add'}
        </button>
        {onCancel && (
          <button className="button" type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {errors.detail && (
        <p className="banner banner-error points-behavior-form-error" role="alert">
          {errors.detail}
        </p>
      )}
    </form>
  );
}

/** Lets a sponsor list the behaviors their drivers earn and lose points for. */
export default function BehaviorManager() {
  const request = useApiRequest(useCallback(() => getBehaviors(), []));
  const { data: behaviors, setData } = request;
  const [editingId, setEditingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');

  const add = async (values) => {
    const created = await createBehavior(values);
    setData((current) => [...(current || []), created]);
    setNotice(`Added “${created.description}”.`);
    setFailure('');
  };

  const save = async (behavior, values) => {
    const updated = await updateBehavior(behavior.id, values);
    setData((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    setEditingId(null);
    setNotice(`Saved “${updated.description}”.`);
    setFailure('');
  };

  const remove = async (behavior) => {
    setRemovingId(behavior.id);
    setNotice('');
    setFailure('');
    try {
      await deleteBehavior(behavior.id);
      setData((current) => current.filter((row) => row.id !== behavior.id));
      setNotice(`Removed “${behavior.description}”.`);
    } catch (error) {
      setFailure(error.message || 'The behavior could not be removed.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section className="card points-card" aria-labelledby="points-behavior-manager-heading">
      <div className="points-card-heading">
        <h2 id="points-behavior-manager-heading">Point behaviors</h2>
        <p>Examples of what earns and costs points. Your drivers see these on their Points page.</p>
      </div>
      <div className="points-card-body points-behavior-manager">
        {notice && (
          <p className="banner banner-success" role="status">
            {notice}
          </p>
        )}
        {failure && (
          <p className="banner banner-error" role="alert">
            {failure}
          </p>
        )}
        {request.error && !behaviors ? (
          <div className="points-inline-error" role="alert">
            <div>
              <strong>Behaviors couldn&apos;t be loaded</strong>
              <p>{request.error.message || 'Try again in a moment.'}</p>
            </div>
            <button className="button" type="button" onClick={request.reload}>
              Try again
            </button>
          </div>
        ) : !behaviors ? (
          <Skeleton className="points-skeleton points-skeleton-list" />
        ) : (
          BEHAVIOR_KINDS.map(({ kind, title, empty }) => {
            const rows = behaviors.filter((behavior) => behavior.kind === kind);
            return (
              <section className={`points-behavior-group ${kind}`} key={kind} aria-label={title}>
                <h3>{title}</h3>
                {rows.length ? (
                  <ul>
                    {rows.map((behavior) =>
                      editingId === behavior.id ? (
                        <li key={behavior.id} className="points-behavior-editing">
                          <BehaviorForm
                            kind={kind}
                            initial={behavior}
                            onSave={(values) => save(behavior, values)}
                            onCancel={() => setEditingId(null)}
                          />
                        </li>
                      ) : (
                        <li key={behavior.id}>
                          <span>{behavior.description}</span>
                          <span
                            className={`badge ${kind === 'good' ? 'badge-success' : 'badge-danger'}`}
                          >
                            {signedPoints(behavior)} pts
                          </span>
                          <span className="points-behavior-actions">
                            <button
                              className="button"
                              type="button"
                              aria-label={`Edit ${behavior.description}`}
                              onClick={() => setEditingId(behavior.id)}
                            >
                              Edit
                            </button>
                            <button
                              className="button button-danger-outline"
                              type="button"
                              disabled={removingId === behavior.id}
                              aria-label={`Remove ${behavior.description}`}
                              onClick={() => remove(behavior)}
                            >
                              {removingId === behavior.id ? 'Removing…' : 'Remove'}
                            </button>
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                ) : (
                  <p className="points-behaviors-note">{empty}</p>
                )}
                <BehaviorForm kind={kind} onSave={add} />
              </section>
            );
          })
        )}
      </div>
    </section>
  );
}
