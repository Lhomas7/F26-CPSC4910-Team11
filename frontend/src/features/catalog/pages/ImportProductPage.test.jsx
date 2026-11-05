import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { importProviderProduct, previewProviderProduct, searchProviderProducts } from 'api/catalog';
import { useAuth } from 'auth/AuthContext';
import ImportProductPage from './ImportProductPage';

jest.mock('api/catalog');
jest.mock('auth/AuthContext');

const preview = {
  provider: 'fake_store', external_product_id: '7', name: 'Travel Bag',
  description: 'Carry essentials', price_usd: '29.95', image_url: '',
  inventory_verified: false,
};

function Location() {
  const location = useLocation();
  return <output aria-label="Route">{location.pathname}</output>;
}

beforeEach(() => {
  useAuth.mockReturnValue({ user: { id: 1, username: 'sponsor', account_type: 'sponsor', company: 'First Freight' } });
  searchProviderProducts.mockReset();
  previewProviderProduct.mockReset();
  importProviderProduct.mockReset();
});

test('searches, previews, and imports one demo product', async () => {
  searchProviderProducts.mockResolvedValue([preview]);
  previewProviderProduct.mockResolvedValue(preview);
  importProviderProduct.mockResolvedValue({ ...preview, id: 12 });
  render(<MemoryRouter initialEntries={['/catalog/import']}><ImportProductPage /><Location /></MemoryRouter>);
  expect(screen.getByText(/stock and external ordering are not verified/i)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Travel' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(await screen.findByRole('button', { name: /Travel Bag/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Travel Bag/ }));
  expect(await screen.findByRole('heading', { name: 'Travel Bag' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Import into catalog' }));
  await waitFor(() => expect(screen.getByRole('status', { name: 'Route' })).toHaveTextContent('/catalog'));
  expect(importProviderProduct).toHaveBeenCalledWith(7);
});

test('duplicate import explains the conflict and preserves the preview', async () => {
  searchProviderProducts.mockResolvedValue([preview]);
  previewProviderProduct.mockResolvedValue(preview);
  importProviderProduct.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));
  render(<MemoryRouter><ImportProductPage /></MemoryRouter>);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Travel' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(await screen.findByRole('button', { name: /Travel Bag/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Import into catalog' }));
  expect(await screen.findByText(/already in your catalog/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Travel Bag' })).toBeInTheDocument();
});
