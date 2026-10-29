import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { createProduct, getCatalog } from '../../../api/catalog';
import { ApiError, NetworkError } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import AddProductPage from './AddProductPage';
import CatalogPage from './CatalogPage';

jest.mock('../../../api/catalog');
jest.mock('../../../auth/AuthContext');

const user = { id: 1, username: 'sponsor.one', account_type: 'sponsor', company: 'First Freight' };
const created = {
  id: 7,
  name: 'Travel Mug',
  description: '',
  image_url: '',
  price_usd: '12.50',
  is_available: true,
  updated_at: '2026-10-21T12:00:00Z',
};

function Location() {
  const location = useLocation();
  return (
    <output aria-label="Current location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderPage() {
  const ui = () => (
    <MemoryRouter
      initialEntries={['/catalog/new']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/catalog/new" element={<AddProductPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
      </Routes>
      <Location />
    </MemoryRouter>
  );
  return { ...render(ui()), ui };
}

function fill() {
  fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Travel Mug' } });
  fireEvent.change(screen.getByLabelText('Price (USD)'), { target: { value: '12.50' } });
}

beforeEach(() => {
  useAuth.mockReturnValue({ user });
  createProduct.mockReset();
  getCatalog.mockReset();
  getCatalog.mockResolvedValue({
    results: [created],
    count: 1,
    next: null,
    previous: null,
    sponsor: { id: 1, name: 'First Freight' },
    pricing: { status: 'unconfigured', points_per_dollar: null },
  });
});

test('blank form has labeled fields, counters, preview, and no owner/conversion inputs', () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'Add product' })).toBeInTheDocument();
  expect(screen.getByText('0/200')).toBeInTheDocument();
  expect(screen.getByText('0/5000')).toBeInTheDocument();
  expect(screen.getByText('No image yet')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /^Available/ })).toBeChecked();
  expect(screen.queryByLabelText(/organization|conversion|point cost/i)).not.toBeInTheDocument();
  expect(createProduct).not.toHaveBeenCalled();
});

test('client errors are linked to fields and focus the first invalid control', () => {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  const name = screen.getByLabelText('Product name');
  expect(name).toHaveFocus();
  expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent('Fix the highlighted fields');
  expect(createProduct).not.toHaveBeenCalled();
});

test('non-HTTPS image URL blocks submission but a missing image does not', () => {
  renderPage();
  fill();
  fireEvent.change(screen.getByLabelText('Image link (optional)'), {
    target: { value: 'http://example.com/x.png' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  expect(screen.getByLabelText('Image link (optional)')).toHaveFocus();
  expect(createProduct).not.toHaveBeenCalled();
});

test('a broken HTTPS preview is recoverable and does not block creation', async () => {
  createProduct.mockResolvedValue(created);
  renderPage();
  fill();
  fireEvent.change(screen.getByLabelText('Image link (optional)'), {
    target: { value: 'https://images.example.com/mug.png' },
  });
  fireEvent.error(screen.getByRole('img', { name: 'Travel Mug' }));
  expect(screen.getByText('Couldn’t load this image')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Current location')).toHaveTextContent(/^\/catalog$/),
  );
  expect(createProduct.mock.calls[0][0].image_url).toBe('https://images.example.com/mug.png');
});

test('zero USD and unavailable state are submitted as a string and boolean', async () => {
  createProduct.mockResolvedValue({ ...created, price_usd: '0.00', is_available: false });
  renderPage();
  fill();
  fireEvent.change(screen.getByLabelText('Price (USD)'), { target: { value: '0.00' } });
  fireEvent.click(screen.getByRole('radio', { name: /^Unavailable/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  await waitFor(() =>
    expect(createProduct).toHaveBeenCalledWith({
      name: 'Travel Mug',
      price_usd: '0.00',
      description: '',
      image_url: '',
      is_available: false,
    }),
  );
});

test('submission disables controls and prevents duplicate POSTs without clearing values', async () => {
  let finish;
  createProduct.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  renderPage();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  expect(screen.getByLabelText('Product name')).toBeDisabled();
  expect(screen.getByLabelText('Product name')).toHaveValue('Travel Mug');
  expect(screen.getByRole('radio', { name: /^Available/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(
    screen.getByText('Please wait for confirmation before leaving this form.'),
  ).toBeInTheDocument();
  fireEvent.submit(screen.getByRole('form', { name: 'Add product' }));
  expect(createProduct).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(created);
  });
});

test('server field errors preserve every value and focus the rejected field', async () => {
  createProduct.mockRejectedValue(
    new ApiError('Rejected', 400, { price_usd: ['Price rejected.'] }),
  );
  renderPage();
  fill();
  fireEvent.change(screen.getByLabelText('Description (optional)'), {
    target: { value: 'Keep this description' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  expect(await screen.findByText('Price rejected.')).toBeInTheDocument();
  expect(screen.getByLabelText('Price (USD)')).toHaveFocus();
  expect(screen.getByLabelText('Product name')).toHaveValue('Travel Mug');
  expect(screen.getByLabelText('Description (optional)')).toHaveValue('Keep this description');
});

test.each([new NetworkError(), new ApiError('Server failed', 500, {})])(
  'uncertain failures warn about duplicates and never auto-retry',
  async (error) => {
    createProduct.mockRejectedValue(error);
    renderPage();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'resubmitting could create a duplicate',
    );
    expect(screen.getByLabelText('Product name')).toHaveValue('Travel Mug');
    expect(screen.getByRole('link', { name: 'Check catalog in a new tab' })).toHaveAttribute(
      'target',
      '_blank',
    );
    expect(createProduct).toHaveBeenCalledTimes(1);
  },
);

test('blank Cancel returns directly; dirty Cancel requires explicit confirmation', async () => {
  renderPage();
  fill();
  screen.getByRole('button', { name: 'Cancel' }).focus();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  const dialog = screen.getByRole('dialog', { name: 'Discard this product?' });
  expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Product name')).toHaveValue('Travel Mug');
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard product' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Current location')).toHaveTextContent(/^\/catalog$/),
  );
  expect(createProduct).not.toHaveBeenCalled();
});

test('empty form Cancel needs no discard dialog', async () => {
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Current location')).toHaveTextContent(/^\/catalog$/),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('breadcrumb also protects dirty values and Escape returns focus to it', () => {
  renderPage();
  fill();
  const breadcrumb = screen.getByRole('link', { name: 'Catalog' });
  breadcrumb.focus();
  fireEvent.click(breadcrumb);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(breadcrumb).toHaveFocus();
});

test('confirmed creation returns to page 1 with success feedback and a fresh Add another form', async () => {
  createProduct.mockResolvedValue(created);
  renderPage();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  expect(await screen.findByText('“Travel Mug” was added.')).toBeInTheDocument();
  expect(screen.getByText(/Products are listed alphabetically/)).toBeInTheDocument();
  expect(screen.getByLabelText('Current location')).toHaveTextContent(/^\/catalog$/);
  fireEvent.click(screen.getByRole('link', { name: 'Add another product' }));
  expect(screen.getByLabelText('Product name')).toHaveValue('');
  expect(screen.getByRole('radio', { name: /^Available/ })).toBeChecked();
});

test.each([401, 403, 409])(
  'access failure %s hides entered details instead of offering a blind retry',
  async (status) => {
    createProduct.mockRejectedValue(new ApiError('Access ended', status, {}));
    renderPage();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    expect(
      await screen.findByRole('heading', { name: 'Product creation is unavailable' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Product name')).not.toBeInTheDocument();
  },
);

test('a late creation response from a previous identity cannot navigate or announce success', async () => {
  let finish;
  createProduct.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender, ui } = renderPage();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
  useAuth.mockReturnValue({ user: { ...user, id: 2, company: 'Other Freight' } });
  rerender(ui());
  expect(screen.getByLabelText('Product name')).toHaveValue('');
  await act(async () => {
    finish(created);
  });
  expect(screen.getByLabelText('Current location')).toHaveTextContent('/catalog/new');
  expect(screen.queryByText('“Travel Mug” was added.')).not.toBeInTheDocument();
});
