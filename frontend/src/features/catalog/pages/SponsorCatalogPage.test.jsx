import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

import { getCatalog } from '../../../api/catalog';
import { useAuth } from '../../../auth/AuthContext';
import CatalogPage from './CatalogPage';

jest.mock('../../../api/catalog');
jest.mock('../../../auth/AuthContext');

const user = { id: 1, username: 'sponsor.one', account_type: 'sponsor', company: 'First Freight' };
const product = {
  id: 1, name: 'Travel Mug', description: 'A reusable mug.', price_usd: '12.50',
  image_url: '', is_available: true, updated_at: '2026-10-21T12:00:00Z',
  point_cost: null, can_afford: null,
};

function response(overrides = {}) {
  return {
    count: 1, next: null, previous: null, results: [product],
    sponsor: { id: 1, name: 'First Freight' }, point_balance: null,
    pricing: { status: 'unconfigured', points_per_dollar: null }, ...overrides,
  };
}

function RouteTools() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current location">{location.pathname}{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>Browser back</button>
    </>
  );
}

function renderPage(entry = '/catalog') {
  const ui = () => (
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CatalogPage />
      <RouteTools />
    </MemoryRouter>
  );
  return { ...render(ui()), ui };
}

beforeEach(() => {
  useAuth.mockReturnValue({ user });
  getCatalog.mockReset();
});

test('renders real products, organization context, pricing notice, and no future controls', async () => {
  getCatalog.mockResolvedValue(response());
  renderPage();
  expect(await screen.findByRole('heading', { name: product.name })).toBeInTheDocument();
  expect(screen.getByText('First Freight’s reward catalog')).toBeInTheDocument();
  expect(screen.getByText('1 product')).toBeInTheDocument();
  expect(screen.getByText(/Reward redemption is not available/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Add product|Mark unavailable/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Catalog pages' })).not.toBeInTheDocument();
});

test('shows loading placeholders instead of invented products', () => {
  getCatalog.mockReturnValue(new Promise(() => {}));
  renderPage();
  expect(screen.getByRole('status', { name: 'Loading catalog' })).toBeInTheDocument();
  expect(screen.queryByText('No products yet')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: product.name })).not.toBeInTheDocument();
});

test('empty catalog is a successful state with organization context', async () => {
  getCatalog.mockResolvedValue(response({ results: [], count: 0 }));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'No products yet' })).toBeInTheDocument();
  expect(screen.getByText('0 products')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('initial failure shows retry and is never represented as empty', async () => {
  getCatalog.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(response());
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  expect(screen.queryByText('No products yet')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: product.name })).toBeInTheDocument();
});

test('transient refresh failure preserves products and retry restores the page', async () => {
  getCatalog.mockResolvedValueOnce(response())
    .mockRejectedValueOnce(new Error('Server unavailable'))
    .mockResolvedValueOnce(response());
  renderPage();
  await screen.findByRole('heading', { name: product.name });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Previously loaded products are still shown.');
  expect(screen.getByRole('heading', { name: product.name })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test.each([401, 403, 409])('access/session error %s removes loaded organization data', async (status) => {
  getCatalog.mockResolvedValueOnce(response()).mockRejectedValueOnce(Object.assign(new Error('Session unavailable'), { status }));
  renderPage();
  await screen.findByRole('heading', { name: product.name });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));
  expect(await screen.findByRole('heading', { name: 'Catalog access is unavailable' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: product.name })).not.toBeInTheDocument();
  expect(screen.queryByText('First Freight’s reward catalog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

test('pagination uses the URL and browser Back returns to the prior page', async () => {
  getCatalog.mockImplementation((page) => Promise.resolve(page === 1
    ? response({ count: 26, next: 'http://test/api/catalog/?page=2' })
    : response({ count: 26, results: [{ ...product, id: 2, name: 'Page Two Reward' }], previous: 'http://test/api/catalog/' })));
  renderPage();
  await screen.findByRole('heading', { name: product.name });
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('heading', { name: 'Page Two Reward' });
  expect(screen.getByLabelText('Current location')).toHaveTextContent('/catalog?page=2');
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  await screen.findByRole('heading', { name: product.name });
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
});

test('page changes disable controls while retaining correctly labeled prior-page content', async () => {
  getCatalog.mockResolvedValueOnce(response({ count: 26, next: 'http://test/?page=2' }))
    .mockReturnValueOnce(new Promise(() => {}));
  renderPage();
  await screen.findByRole('heading', { name: product.name });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: product.name })).toBeInTheDocument();
});

test('out-of-range page recovers to page 1 exactly once and fixes the URL', async () => {
  getCatalog.mockRejectedValueOnce(Object.assign(new Error('Invalid page'), { status: 404 }))
    .mockResolvedValueOnce(response());
  renderPage('/catalog?page=99');
  expect(await screen.findByRole('heading', { name: product.name })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Current location')).toHaveTextContent(/^\/catalog$/));
  expect(screen.getByText(/That page doesn.t exist. Showing page 1./)).toBeInTheDocument();
  expect(getCatalog.mock.calls.map(([page]) => page)).toEqual([99, 1]);
});

test('failed page-1 recovery produces a real error without a recovery loop', async () => {
  getCatalog.mockRejectedValue(Object.assign(new Error('Not found'), { status: 404 }));
  renderPage('/catalog?page=99');
  expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
  expect(getCatalog.mock.calls.map(([page]) => page)).toEqual([99, 1]);
  expect(screen.queryByText('No products yet')).not.toBeInTheDocument();
});

test('invalid URL page is normalized without requesting it', async () => {
  getCatalog.mockResolvedValue(response());
  renderPage('/catalog?page=-5');
  await screen.findByRole('heading', { name: product.name });
  expect(getCatalog.mock.calls.every(([page]) => page === 1)).toBe(true);
  expect(screen.getByLabelText('Current location')).toHaveTextContent(/^\/catalog$/);
});

test.each([
  { id: 2, username: 'sponsor.two', company: 'Second Freight' },
  { company: 'Second Freight' },
  { impersonation: { active: true, admin: { id: 10 }, expires_at: '2026-10-21T20:00:00Z' } },
])('identity/organization/View-As change clears stale cards immediately', async (changed) => {
  let finishOldRequest;
  let finishNewRequest;
  getCatalog.mockResolvedValueOnce(response())
    .mockImplementationOnce(() => new Promise((resolve) => { finishOldRequest = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { finishNewRequest = resolve; }));
  const { rerender, ui } = renderPage();
  await screen.findByRole('heading', { name: product.name });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));
  useAuth.mockReturnValue({ user: { ...user, ...changed } });
  rerender(ui());
  expect(screen.queryByRole('heading', { name: product.name })).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Loading catalog' })).toBeInTheDocument();
  await act(async () => { finishOldRequest(response()); });
  expect(screen.queryByRole('heading', { name: product.name })).not.toBeInTheDocument();
  await act(async () => {
    finishNewRequest(response({ sponsor: { id: 2, name: 'New Company' }, results: [{ ...product, id: 2, name: 'New Reward' }] }));
  });
  expect(screen.getByRole('heading', { name: 'New Reward' })).toBeInTheDocument();
});
