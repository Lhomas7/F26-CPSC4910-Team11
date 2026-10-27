import { fireEvent, render, screen, within } from '@testing-library/react';

import ProductCard from './ProductCard';
import ProductGrid from './ProductGrid';
import ProductImage from './ProductImage';
import ProductPricing from './ProductPricing';
import SponsorProductFooter from './SponsorProductFooter';

const product = {
  id: 1,
  name: 'Insulated Travel Mug',
  description: 'A reusable mug.',
  image_url: 'https://images.example.com/mug.png',
  price_usd: '24.95',
  is_available: true,
  updated_at: '2026-10-21T19:04:00Z',
  point_cost: null,
  can_afford: null,
};

test('renders the shared card hierarchy, confirmed status, and unconfigured pricing', () => {
  render(<ProductGrid><ProductCard product={product} /></ProductGrid>);

  expect(screen.getByRole('list', { name: 'Products' })).toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveClass('card', 'catalog-product-card');
  expect(screen.getByRole('heading', { level: 3, name: product.name })).toBeInTheDocument();
  expect(screen.getByText('Available')).toHaveClass('badge-success');
  expect(screen.getByText('$24.95')).toBeInTheDocument();
  expect(screen.getByText('Point cost: Not configured')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('unavailable is explicit and independent of unknown affordability', () => {
  render(<ProductGrid><ProductCard product={{ ...product, is_available: false }} /></ProductGrid>);
  expect(screen.getByRole('listitem')).toHaveClass('is-unavailable');
  expect(screen.getByText('Unavailable')).toHaveClass('badge-neutral');
  expect(screen.getByText('Point cost: Not configured')).toBeInTheDocument();
  expect(screen.queryByText(/not enough points|affordable|in stock/i)).not.toBeInTheDocument();
});

test('zero USD is not displayed as zero points', () => {
  render(<ProductPricing priceUsd="0.00" />);
  expect(screen.getByText('$0.00')).toBeInTheDocument();
  expect(screen.getByText('Point cost: Not configured')).toBeInTheDocument();
  expect(screen.queryByText(/^0 points$/)).not.toBeInTheDocument();
});

test('large valid prices are formatted for US dollars', () => {
  render(<ProductPricing priceUsd="9999999999.99" />);
  expect(screen.getByText('$9,999,999,999.99')).toBeInTheDocument();
});

test.each([null, undefined, '', 'NaN', '-1.00', '1.234'])('does not coerce invalid price %s into a reward cost', (value) => {
  render(<ProductPricing priceUsd={value} />);
  expect(screen.getByText('Price unavailable')).toBeInTheDocument();
  expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
});

test('images have a useful name and load lazily without sending a referrer', () => {
  render(<ProductImage src={product.image_url} name={product.name} />);
  const image = screen.getByRole('img', { name: product.name });
  expect(image).toHaveAttribute('src', product.image_url);
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
});

test('missing and failed images have distinct accessible fallback text', () => {
  const { rerender } = render(<ProductImage name={product.name} />);
  expect(screen.getByText('No image added')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();

  rerender(<ProductImage src={product.image_url} name={product.name} />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByText('Image didn’t load')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByText('No image added')).not.toBeInTheDocument();
});

test('a replacement URL resets the failed image state', () => {
  const { rerender } = render(<ProductImage src={product.image_url} name={product.name} />);
  fireEvent.error(screen.getByRole('img'));
  rerender(<ProductImage src="https://images.example.com/replacement.png" name={product.name} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://images.example.com/replacement.png');
  expect(screen.queryByText('Image didn’t load')).not.toBeInTheDocument();
});

test('one broken product image does not affect another card', () => {
  render(
    <ProductGrid>
      <ProductCard product={product} />
      <ProductCard product={{ ...product, id: 2, name: 'Safety Jacket', image_url: 'https://images.example.com/jacket.png' }} />
    </ProductGrid>,
  );
  fireEvent.error(screen.getByRole('img', { name: product.name }));
  const cards = screen.getAllByRole('listitem');
  expect(within(cards[0]).getByText('Image didn’t load')).toBeInTheDocument();
  expect(within(cards[1]).getByRole('img', { name: 'Safety Jacket' })).toBeInTheDocument();
});

test.each(['http://images.example.com/mug.png', 'javascript:alert(1)', 'data:image/png;base64,abc'])('does not render unsupported image URL %s', (src) => {
  render(<ProductImage src={src} name={product.name} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('Image didn’t load')).toBeInTheDocument();
});

test('formats a valid timestamp in local US 12-hour time while keeping the ISO value', () => {
  render(<ProductGrid><ProductCard product={product} footer={<SponsorProductFooter product={product} />} /></ProductGrid>);
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(product.updated_at));
  expect(screen.getByText(`Updated ${formatted}`)).toHaveAttribute('datetime', product.updated_at);
});

test('omits invalid timestamps and empty descriptions without inventing actions', () => {
  render(<ProductGrid><ProductCard product={{ ...product, updated_at: 'bad date', description: '' }} /></ProductGrid>);
  expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('accepts a future role-specific footer slot and alternate heading level', () => {
  render(
    <ProductGrid>
      <ProductCard product={product} headingLevel={2} footer={<span>Role-specific footer</span>} />
    </ProductGrid>,
  );
  expect(screen.getByRole('heading', { level: 2, name: product.name })).toBeInTheDocument();
  expect(screen.getByText('Role-specific footer')).toBeInTheDocument();
});

test('long names remain complete and product text is rendered as text, not HTML', () => {
  const name = 'Very long product name '.repeat(8);
  render(
    <ProductGrid><ProductCard product={{ ...product, name, description: '<script>alert(1)</script>' }} /></ProductGrid>,
  );
  expect(screen.getByRole('heading')).toHaveTextContent(name.trim());
  // getByText skips <script> elements, so a match means it rendered as plain text.
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
});
