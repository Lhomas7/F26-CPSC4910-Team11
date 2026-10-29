import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { createProduct } from '../../../api/catalog';
import { NetworkError } from '../../../api/client';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import ConfirmDialog from '../../../components/feedback/ConfirmDialog';
import StatePanel from '../../../components/feedback/StatePanel';
import ProductImage from '../components/ProductImage';
import { catalogIdentity } from '../utils/identity';
import {
  EMPTY_PRODUCT,
  isHttpsImageUrl,
  productFieldErrors,
  validateProductInput,
} from '../utils/productInput';
import './AddProductPage.css';

const FIELD_ORDER = Object.keys(EMPTY_PRODUCT);
const fieldId = (name) => `catalog-add-${name}`;

function Field({ name, label, hint, error, optional, counter, children }) {
  return (
    <div className="catalog-add-field">
      <label htmlFor={fieldId(name)}>
        {label}
        {optional && <span className="catalog-add-optional"> (optional)</span>}
      </label>
      {children}
      <div className="catalog-add-field-foot">
        <small id={`${fieldId(name)}-hint`}>{hint}</small>
        {counter && (
          <span className={`catalog-add-counter${counter.over ? ' is-over' : ''}`}>
            {counter.text}
          </span>
        )}
      </div>
      {error && (
        <small className="catalog-add-error" id={`${fieldId(name)}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}

function ProductCreationForm({ identity }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const active = useRef(false);
  const inFlight = useRef(false);
  const focusError = useRef(false);
  const controls = useRef({});
  const errorPanel = useRef(null);
  const dirty = FIELD_ORDER.some((field) => form[field] !== EMPTY_PRODUCT[field]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (!dirty && !busy) return undefined;
    // This is a browser-leave warning, not draft persistence. Explicit Cancel
    // and the breadcrumb use our shared confirmation dialog below.
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);

  useEffect(() => {
    if (!focusError.current) return;
    focusError.current = false;
    const first = FIELD_ORDER.find((field) => errors[field]);
    (controls.current[first] || errorPanel.current)?.focus();
  }, [errors, failure]);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    // Keep an ambiguous-outcome warning visible while editing: a previous
    // POST may already have created a record, even if its response was lost.
    setFailure((current) => (current?.ambiguous ? current : null));
  };

  const cancel = () => {
    if (inFlight.current) return;
    if (dirty && !denied) setConfirmCancel(true);
    else navigate('/catalog');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current || confirmCancel) return;
    const result = validateProductInput(form);
    setErrors(result.errors);
    if (Object.keys(result.errors).length) {
      focusError.current = true;
      setFailure({ message: 'Fix the highlighted fields and try again.', ambiguous: false });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const created = await createProduct(result.values);
      if (!active.current) return;
      // Leave the form only after confirmed creation. The destination reloads
      // page 1; alphabetical ordering may put the new reward on a later page.
      navigate('/catalog', {
        replace: true,
        state: { catalogCreated: { id: created.id, name: created.name, identity } },
      });
    } catch (error) {
      if (!active.current) return;
      if ([401, 403, 409].includes(error.status)) {
        setDenied(true);
      } else {
        const fieldErrors = [400, 422].includes(error.status) ? productFieldErrors(error.data) : {};
        const ambiguous = error instanceof NetworkError || error.status >= 500;
        setErrors(fieldErrors);
        focusError.current = true;
        setFailure({
          ambiguous,
          message: Object.keys(fieldErrors).length
            ? 'Fix the highlighted fields and try again.'
            : error.message || 'The product could not be added. Try again.',
        });
      }
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  };

  const propsFor = (name) => ({
    id: fieldId(name),
    name,
    disabled: busy,
    ref: (node) => {
      controls.current[name] = node;
    },
    'aria-invalid': Boolean(errors[name]) || undefined,
    'aria-describedby': `${fieldId(name)}-hint${errors[name] ? ` ${fieldId(name)}-error` : ''}`,
  });
  const previewUrl = form.image_url.trim();
  const validPreview = isHttpsImageUrl(previewUrl);

  return (
    <>
      <PageHeader
        title="Add product"
        breadcrumb={
          <>
            {busy ? (
              <span aria-disabled="true">Catalog</span>
            ) : (
              <Link
                to="/catalog"
                onClick={(event) => {
                  event.preventDefault();
                  cancel();
                }}
              >
                Catalog
              </Link>
            )}
            {' / Add product'}
          </>
        }
      />
      <main className="catalog-add-content">
        {denied ? (
          <StatePanel tone="error" title="Product creation is unavailable">
            <p>
              Your access or session changed. Return to the catalog or sign in again before
              continuing.
            </p>
            <Link className="button" to="/catalog">
              Return to catalog
            </Link>
          </StatePanel>
        ) : (
          <>
            {failure && (
              <div className="banner banner-error" role="alert" ref={errorPanel} tabIndex={-1}>
                <strong>{failure.message}</strong>
                {failure.ambiguous && (
                  <>
                    <p>
                      The product may or may not have been created. Check the catalog before
                      submitting again; resubmitting could create a duplicate.
                    </p>
                    <Link to="/catalog" target="_blank" rel="noopener noreferrer">
                      Check catalog in a new tab
                    </Link>
                  </>
                )}
              </div>
            )}
            <form
              className="card catalog-add-card"
              aria-label="Add product"
              aria-busy={busy}
              noValidate
              onSubmit={submit}
            >
              <h2 className="sr-only">Product details</h2>
              <div className="catalog-add-layout">
                <div className="catalog-add-fields">
                  <Field
                    name="name"
                    label="Product name"
                    hint="What drivers will see in the catalog."
                    error={errors.name}
                    counter={{ text: `${form.name.length}/200`, over: form.name.length > 200 }}
                  >
                    <input
                      {...propsFor('name')}
                      required
                      maxLength={200}
                      value={form.name}
                      onChange={(event) => update('name', event.target.value)}
                    />
                  </Field>
                  <Field
                    name="price_usd"
                    label="Price (USD)"
                    hint="Up to two decimal places. A free product is 0.00."
                    error={errors.price_usd}
                  >
                    <div className="catalog-add-price">
                      <span aria-hidden="true">$</span>
                      <input
                        {...propsFor('price_usd')}
                        required
                        inputMode="decimal"
                        placeholder="0.00"
                        value={form.price_usd}
                        onChange={(event) => update('price_usd', event.target.value)}
                      />
                    </div>
                  </Field>
                  <Field
                    name="description"
                    label="Description"
                    optional
                    hint="Paragraph breaks are kept."
                    error={errors.description}
                    counter={{
                      text: `${form.description.length}/5000`,
                      over: form.description.length > 5000,
                    }}
                  >
                    <textarea
                      {...propsFor('description')}
                      maxLength={5000}
                      value={form.description}
                      onChange={(event) => update('description', event.target.value)}
                    />
                  </Field>
                  <Field
                    name="image_url"
                    label="Image link"
                    optional
                    hint="Must start with https://. Paste a link to an image hosted elsewhere."
                    error={errors.image_url}
                  >
                    <input
                      {...propsFor('image_url')}
                      type="url"
                      maxLength={2048}
                      placeholder="https://"
                      value={form.image_url}
                      onChange={(event) => update('image_url', event.target.value)}
                    />
                  </Field>
                  <fieldset
                    className="catalog-add-availability"
                    disabled={busy}
                    aria-describedby={
                      errors.is_available ? `${fieldId('is_available')}-error` : undefined
                    }
                  >
                    <legend>Availability</legend>
                    <div className="catalog-add-radio-row">
                      {[true, false].map((value) => (
                        <label key={String(value)}>
                          <input
                            type="radio"
                            name="is_available"
                            value={String(value)}
                            ref={
                              value
                                ? (node) => {
                                    controls.current.is_available = node;
                                  }
                                : undefined
                            }
                            checked={form.is_available === value}
                            onChange={() => update('is_available', value)}
                          />
                          <span>
                            {value ? 'Available' : 'Unavailable'}
                            <small>
                              {value
                                ? 'Drivers will see this product as available.'
                                : 'Still listed, but marked as unavailable.'}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {errors.is_available && (
                      <small className="catalog-add-error" id={`${fieldId('is_available')}-error`}>
                        {errors.is_available}
                      </small>
                    )}
                  </fieldset>
                </div>
                <aside className="catalog-add-preview" aria-labelledby="catalog-preview-heading">
                  <h2 id="catalog-preview-heading">Image preview</h2>
                  <ProductImage
                    src={validPreview ? previewUrl : ''}
                    name={form.name.trim() || 'Product image preview'}
                    emptyText={previewUrl ? 'Not a preview yet' : 'No image yet'}
                    failedText="Couldn’t load this image"
                  />
                  <p>
                    This preview loads the image in your browser. The server doesn&apos;t check the
                    link, so you can still save a product whose image doesn&apos;t load.
                  </p>
                </aside>
              </div>
              <div className="catalog-add-actions">
                {busy && (
                  <p className="catalog-add-cancel-note">
                    Please wait for confirmation before leaving this form.
                  </p>
                )}
                <button
                  className="button button-large"
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary button-large"
                  type="submit"
                  disabled={busy}
                  aria-busy={busy || undefined}
                >
                  {busy ? 'Adding…' : 'Add product'}
                </button>
              </div>
            </form>
          </>
        )}
      </main>
      {confirmCancel && (
        <ConfirmDialog
          title="Discard this product?"
          message="Your entered product details will be lost."
          cancelLabel="Keep editing"
          confirmLabel="Discard product"
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => navigate('/catalog')}
        />
      )}
    </>
  );
}

export default function AddProductPage() {
  const { user } = useAuth();
  if (user?.account_type !== 'sponsor') return null; // The route supplies the access-denied panel.
  const identity = catalogIdentity(user);
  return <ProductCreationForm key={identity} identity={identity} />;
}
