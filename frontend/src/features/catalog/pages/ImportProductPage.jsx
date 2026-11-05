import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { importProviderProduct, previewProviderProduct, searchProviderProducts } from '../../../api/catalog';
import PageHeader from '../../../app/PageHeader';
import { useAuth } from '../../../auth/AuthContext';
import StatePanel from '../../../components/feedback/StatePanel';
import ProductImage from '../components/ProductImage';
import { catalogIdentity } from '../utils/identity';
import '../Catalog.css';

function ImportProductContent({ identity }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const requestVersion = useRef(0);
  useEffect(() => () => { requestVersion.current += 1; }, []);

  function reportFailure(failure, fallback) {
    if ([401, 403, 409].includes(failure?.status)) {
      setDenied(true);
      setResults(null);
      setPreview(null);
    }
    setError(failure.message || fallback);
  }

  async function search(event) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    const version = ++requestVersion.current;
    setBusy(true);
    setError('');
    setPreview(null);
    setResults(null);
    try {
      const found = await searchProviderProducts(query);
      if (version === requestVersion.current) setResults(found);
    } catch (failure) {
      if (version === requestVersion.current) reportFailure(failure, 'Search failed. Try again.');
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  async function select(product) {
    const version = ++requestVersion.current;
    setBusy(true);
    setError('');
    try {
      const fresh = await previewProviderProduct(Number(product.external_product_id));
      if (version === requestVersion.current) setPreview(fresh);
    } catch (failure) {
      if (version === requestVersion.current) reportFailure(failure, 'Preview failed. Try again.');
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  async function importSelected() {
    if (!preview || busy) return;
    const version = ++requestVersion.current;
    setBusy(true);
    setError('');
    try {
      const product = await importProviderProduct(Number(preview.external_product_id));
      if (version === requestVersion.current) {
        navigate('/catalog', {
          state: { catalogCreated: { identity, id: product.id, name: product.name } },
        });
      }
    } catch (failure) {
      if (version === requestVersion.current) {
        if (failure.status === 409) {
          setError('This product is already in your catalog.');
        } else {
          reportFailure(failure, 'Import failed. Check your catalog before retrying.');
        }
      }
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Import product" subtitle="Browse Fake Store API demo products" />
      <main className="catalog-content" aria-busy={busy}>
        <p className="banner">These are sample products. Price comes from Fake Store API; stock and external ordering are not verified.</p>
        {!denied && <form className="catalog-provider-search" role="search" onSubmit={search}>
          <label htmlFor="catalog-provider-query">Search product names</label>
          <div className="catalog-toolbar-actions">
            <input id="catalog-provider-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} />
            <button className="button button-primary" type="submit" disabled={busy || !query.trim()}>Search</button>
            <Link className="button" to="/catalog">Cancel</Link>
          </div>
        </form>}
        {error && <StatePanel tone="error" title="Product lookup failed"><p>{error}</p></StatePanel>}
        {busy && <p role="status">Loading product details…</p>}
        {results && <section aria-label="Search results">
          <h2>{results.length ? `${results.length} matching products` : 'No matching products'}</h2>
          <div className="catalog-provider-results">
            {results.map((product) => <button className="button catalog-provider-result" key={product.external_product_id} type="button" disabled={busy} onClick={() => select(product)}>
              <span>{product.name}</span><span>${product.price_usd}</span>
            </button>)}
          </div>
        </section>}
        {preview && <section className="card catalog-provider-preview" aria-label="Product preview">
          <ProductImage src={preview.image_url} name={preview.name} />
          <div>
            <h2>{preview.name}</h2>
            <p>{preview.description}</p>
            <p>Current provider price: ${preview.price_usd}</p>
            <p>Inventory is not verified. You can manage listing availability after import.</p>
            <button className="button button-primary" type="button" disabled={busy} onClick={importSelected}>Import into catalog</button>
          </div>
        </section>}
      </main>
    </>
  );
}

export default function ImportProductPage() {
  const { user } = useAuth();
  const identity = catalogIdentity(user);
  return <ImportProductContent key={identity} identity={identity} />;
}
