import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

import { getCatalog } from '../../../api/catalog';
import { ApiError } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import CatalogPage from './CatalogPage';

jest.mock('../../../api/catalog');
jest.mock('../../../auth/AuthContext');

const user = { id: 1, username: 'driver.one', account_type: 'driver', company: 'First Freight' };
const product = {
  id: 1, name: 'Travel Mug', description: 'A reusable mug.', image_url: '', price_usd: '24.95',
  point_cost: 2495, can_afford: true, is_available: true, updated_at: '2026-10-21T12:00:00Z',
};
const response = (overrides = {}) => ({
  count: 1, next: null, previous: null, results: [product],
  sponsor: { id: 1, name: 'First Freight' }, point_balance: 3200,
  pricing: { status: 'configured', points_per_dollar: 100 }, ...overrides,
});

function RouteTools() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="Current location">{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <button onClick={() => navigate('/catalog?page=2')}>Open page two</button>
  </>;
}

function renderPage(entry = '/catalog') {
  const ui = () => <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <CatalogPage /><RouteTools />
  </MemoryRouter>;
  return { ...render(ui()), ui };
}

beforeEach(() => {
  useAuth.mockReturnValue({ user });
  getCatalog.mockReset();
});

test('loads real Driver catalog, balance, rate and points without Sponsor or purchase actions', async () => {
  getCatalog.mockResolvedValue(response());
  renderPage();
  expect(await screen.findByRole('heading', { name: product.name, level: 3 })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Catalog', level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Rewards', level: 2 })).toBeInTheDocument();
  expect(screen.getByText('First Freight’s reward catalog')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Your point balance' })).getByText('3,200')).toBeInTheDocument();
  expect(screen.getByText('Catalog rate: 100 points per $1')).toBeInTheDocument();
  expect(screen.getByText('2,495 points')).toBeInTheDocument();
  expect(screen.getByText('Within your balance')).toBeInTheDocument();
  expect(screen.queryByText('$24.95')).not.toBeInTheDocument();
  expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Mark |Add |Redeem|Buy|Checkout/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Add product/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Redeeming rewards isn’t available yet/)).toBeInTheDocument();
  expect(getCatalog).toHaveBeenCalledWith(1);
});

test('loading hides balance and does not invent empty rewards', () => {
  getCatalog.mockReturnValue(new Promise(() => {}));
  renderPage();
  expect(screen.getByRole('status', { name: 'Loading catalog' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Your point balance' })).not.toBeInTheDocument();
  expect(screen.queryByText('No rewards yet')).not.toBeInTheDocument();
});

test('empty catalog is successful and preserves organization and zero balance', async () => {
  getCatalog.mockResolvedValue(response({ results: [], count: 0, point_balance: 0 }));
  renderPage();
  expect(await screen.findByRole('heading', { name: 'No rewards yet' })).toBeInTheDocument();
  expect(screen.getByText('0 products')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Your point balance' })).getByText('0')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('unconfigured pricing uses one neutral notice and no affordability verdict', async () => {
  getCatalog.mockResolvedValue(response({
    pricing: { status: 'unconfigured', points_per_dollar: null },
    results: [{ ...product, point_cost: null, can_afford: null }],
  }));
  renderPage();
  await screen.findByRole('heading', { name: product.name });
  expect(screen.getByText('Point cost: Not configured')).toBeInTheDocument();
  expect(screen.getAllByText(/Redeeming rewards isn’t available yet/)).toHaveLength(1);
  expect(screen.queryByText(/Within your balance|Need .* more/)).not.toBeInTheDocument();
});

test('initial error can be retried without masquerading as an empty catalog', async () => {
  getCatalog.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(response());
  renderPage();
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  expect(screen.queryByRole('region', { name: 'Your point balance' })).not.toBeInTheDocument();
  expect(screen.queryByText('No rewards yet')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: product.name })).toBeInTheDocument();
});

test('refresh failure retains only same-account data with stale balance feedback, then clears on success', async () => {
  getCatalog.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(response({ point_balance: 4000 }));
  renderPage();
  await screen.findByRole('heading', { name: product.name });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('may be out of date');
  expect(screen.getByRole('heading', { name: product.name })).toBeInTheDocument();
  expect(screen.getByText('May be out of date')).toBeInTheDocument();
  expect(screen.getByText('3,200')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('4,000')).toBeInTheDocument();
  expect(screen.queryByText('May be out of date')).not.toBeInTheDocument();
});

test.each([
  ['driver_not_approved', 'Your approval is pending'], ['sponsor_required', 'No sponsor linked'],
])('access code %s shows guidance instead of an empty catalog', async (code, title) => {
  getCatalog.mockRejectedValue(new ApiError('Denied', 403, { code }));
  renderPage();
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Your point balance' })).not.toBeInTheDocument();
});

test.each([401, 403, 409])('denial %s clears balance/products and never revives them on query changes', async (status) => {
  getCatalog.mockResolvedValueOnce(response()).mockRejectedValueOnce(new ApiError('Session unavailable', status))
    .mockReturnValue(new Promise(() => {}));
  renderPage();
  await screen.findByRole('heading', { name: product.name });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));
  await screen.findByRole('heading', { name: 'Catalog access is unavailable' });
  expect(screen.queryByRole('heading', { name: product.name })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Your point balance' })).not.toBeInTheDocument();
  expect(screen.queryByText('First Freight’s reward catalog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open page two' }));
  expect(screen.queryByText('3,200')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Catalog access is unavailable' })).toBeInTheDocument();
});

test('pagination uses the URL, labels previous content while loading, and supports Back', async () => {
  let finish;
  getCatalog.mockResolvedValueOnce(response({ count: 26, next: 'https://example.test/?page=2' }))
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce(response({ count: 26, next: '?page=2' }));
  renderPage();
  await screen.findByRole('heading', { name: product.name });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.getByText('May be out of date')).toBeInTheDocument();
  await act(async () => finish(response({ count: 26, previous: '?page=1', results: [{ ...product, id: 2, name: 'Jacket' }] })));
  expect(screen.getByLabelText('Current location')).toHaveTextContent('/catalog?page=2');
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(await screen.findByRole('heading', { name: product.name })).toBeInTheDocument();
});

test('out-of-range page recovers once to page one without following response URLs', async () => {
  getCatalog.mockRejectedValueOnce(new ApiError('Invalid page', 404)).mockResolvedValueOnce(response());
  renderPage('/catalog?page=99');
  await screen.findByRole('heading', { name: product.name });
  await waitFor(() => expect(screen.getByLabelText('Current location')).toHaveTextContent(/^\/catalog$/));
  expect(screen.getByText(/Showing page 1/)).toBeInTheDocument();
  expect(getCatalog.mock.calls.map(([page]) => page)).toEqual([99, 1]);
});

test('failed recovery is a real error without a loop', async () => {
  getCatalog.mockRejectedValue(new ApiError('Not found', 404));
  renderPage('/catalog?page=99');
  expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
  expect(getCatalog.mock.calls.map(([page]) => page)).toEqual([99, 1]);
});

test.each(['-1', '1.5', '0', 'banana', '9007199254740992'])('normalizes invalid page %s', async (value) => {
  getCatalog.mockResolvedValue(response());
  renderPage(`/catalog?page=${value}`);
  await screen.findByRole('heading', { name: product.name });
  expect(screen.getByLabelText('Current location')).toHaveTextContent(/^\/catalog$/);
  expect(getCatalog.mock.calls.every(([page]) => page === 1)).toBe(true);
});

test.each([
  { id: 2, username: 'driver.two' }, { company: 'Other Freight' },
  { impersonation: { active: true, admin: { id: 8 }, expires_at: '2026-10-21T20:00:00Z' } },
])('identity change clears both balance and cards and ignores late responses: %j', async (changed) => {
  let oldRequest;
  let newRequest;
  getCatalog.mockResolvedValueOnce(response())
    .mockImplementationOnce(() => new Promise((resolve) => { oldRequest = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { newRequest = resolve; }));
  const { rerender, ui } = renderPage();
  await screen.findByRole('heading', { name: product.name });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh catalog' }));
  useAuth.mockReturnValue({ user: { ...user, ...changed } });
  rerender(ui());
  expect(screen.queryByText('3,200')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: product.name })).not.toBeInTheDocument();
  await act(async () => oldRequest(response()));
  expect(screen.queryByText('3,200')).not.toBeInTheDocument();
  await act(async () => newRequest(response({ point_balance: 9000, results: [{ ...product, id: 2, name: 'New reward' }] })));
  expect(screen.getByText('9,000')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'New reward' })).toBeInTheDocument();
});

test('malformed individual cost stays unknown without gray styling', async () => {
  getCatalog.mockResolvedValue(response({ results: [{ ...product, point_cost: null }] }));
  renderPage();
  expect(await screen.findByText(/We can’t confirm this cost/)).toBeInTheDocument();
  expect(screen.getByRole('listitem')).not.toHaveClass('is-unaffordable');
});
