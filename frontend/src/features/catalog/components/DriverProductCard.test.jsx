import { fireEvent, render, screen } from '@testing-library/react';

import ProductCard from './ProductCard';
import ProductPricing from './ProductPricing';
import SponsorProductFooter from './SponsorProductFooter';

const pricing = { status: 'configured', points_per_dollar: 100 };
const product = {
  id: 1, name: 'Mug', description: 'Reusable mug', image_url: '', price_usd: '24.95',
  point_cost: 2495, can_afford: true, is_available: true, updated_at: '2026-10-21T12:00:00Z',
};

test.each([true, false])('availability %s stays independent from affordability', (available) => {
  const { rerender } = render(<ProductCard viewer="driver" pricing={pricing} pointBalance={3200}
    product={{ ...product, is_available: available }} />);
  expect(screen.getByText(available ? 'Available' : 'Unavailable')).toBeInTheDocument();
  expect(screen.getByText('Within your balance')).toBeInTheDocument();
  expect(screen.getByText('2,495 points')).toBeInTheDocument();
  expect(screen.getByRole('listitem')).not.toHaveClass('is-unaffordable');
  expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  rerender(<ProductCard viewer="driver" pricing={pricing} pointBalance={795}
    product={{ ...product, can_afford: false, is_available: available }} />);
  expect(screen.getByText('Need 1,700 more points')).toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveClass('is-unaffordable');
});

test.each([
  [2495, 2495, true, 'Within your balance'],
  [2495, 2494, false, 'Need 1 more point'],
  [0, 0, true, 'Within your balance'],
  [1, 0, false, 'Need 1 more point'],
  [1, -1, false, 'Need 2 more points'],
])('renders boundary cost %s balance %s', (pointCost, pointBalance, canAfford, text) => {
  render(<ProductPricing viewer="driver" pricing={pricing} pointCost={pointCost}
    pointBalance={pointBalance} canAfford={canAfford} />);
  expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.getByText(`${pointCost.toLocaleString('en-US')} ${pointCost === 1 ? 'point' : 'points'}`)).toBeInTheDocument();
});

test.each([
  [999999999999000, true, 'Within your balance'],
  [999999999998999, false, 'Need 1 more point'],
  [0, false, 'Need 999,999,999,999,000 more points'],
])('formats the largest supported catalog point cost at balance %s', (balance, affordable, message) => {
  // Maximum model USD price times the maximum organization rate. Use a
  // literal expected display so the test does not duplicate the formatter.
  render(<ProductCard viewer="driver" pricing={{ status: 'configured', points_per_dollar: 100000 }}
    pointBalance={balance} product={{ ...product, point_cost: 999999999999000, can_afford: affordable }} />);
  expect(screen.getByText('999,999,999,999,000 points')).toBeInTheDocument();
  expect(screen.getByText(message)).toBeInTheDocument();
  expect(screen.queryByText(/We can’t confirm this cost/)).not.toBeInTheDocument();
  if (affordable) expect(screen.getByRole('listitem')).not.toHaveClass('is-unaffordable');
  else expect(screen.getByRole('listitem')).toHaveClass('is-unaffordable');
});

test.each([
  { point_cost: null }, { point_cost: -1 }, { point_cost: 1.5 },
  { point_cost: '2495' }, { point_cost: Number.MAX_SAFE_INTEGER + 1 },
  { can_afford: undefined }, { can_afford: 'true' }, { can_afford: false },
  { point_cost: 9000, can_afford: true },
])('invalid configured pricing stays unknown: %j', (changes) => {
  render(<ProductCard viewer="driver" pricing={pricing} pointBalance={3200} product={{ ...product, ...changes }} />);
  expect(screen.getByText('We can’t confirm this cost right now. Refresh to try again.')).toBeInTheDocument();
  expect(screen.getByRole('listitem')).not.toHaveClass('is-unaffordable');
  expect(screen.queryByText('Point cost: Not configured')).not.toBeInTheDocument();
  expect(screen.queryByText('Within your balance')).not.toBeInTheDocument();
  expect(screen.queryByText(/Need .* more/)).not.toBeInTheDocument();
});

test('unconfigured pricing is neither zero nor unaffordable', () => {
  render(<ProductCard viewer="driver" pricing={{ status: 'unconfigured', points_per_dollar: null }}
    pointBalance={0} product={{ ...product, point_cost: null, can_afford: null }} />);
  expect(screen.getByText('Point cost: Not configured')).toHaveClass('is-unset');
  expect(screen.queryByText(/Within your balance|more points|confirm this cost/)).not.toBeInTheDocument();
  expect(screen.getByRole('listitem')).not.toHaveClass('is-unaffordable');
});

test.each([undefined, null, '3200', NaN])('unknown balance %s never yields an affordability claim', (balance) => {
  render(<ProductCard viewer="driver" pricing={pricing} pointBalance={balance} product={product} />);
  expect(screen.getByText(/We can’t confirm this cost/)).toBeInTheDocument();
});

test('Sponsor retains USD-primary, configured point cost, explicit actions and timestamp', () => {
  render(<ProductCard product={product} pricing={pricing}
    footer={<SponsorProductFooter product={product}><button>Mark unavailable</button></SponsorProductFooter>} />);
  expect(screen.getByText('$24.95')).toBeInTheDocument();
  expect(screen.getByText('Point cost: 2,495 points')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Mark unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Updated/)).toHaveAttribute('datetime', product.updated_at);
  expect(screen.queryByText('Within your balance')).not.toBeInTheDocument();
});

test('Sponsor malformed configured cost is not shown as unconfigured or free', () => {
  render(<ProductPricing pricing={pricing} priceUsd="0.00" pointCost={null} />);
  expect(screen.getByText('$0.00')).toBeInTheDocument();
  expect(screen.getByText('Point cost unavailable')).toBeInTheDocument();
});

test('invalid Sponsor timestamps do not render Invalid Date', () => {
  const { container } = render(<SponsorProductFooter product={{ updated_at: 'invalid' }} />);
  expect(container.querySelector('time')).toBeNull();
});

test('Show more remains usable on an unavailable, unaffordable card', () => {
  const clipped = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
  const full = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(80);
  try {
    render(<ProductCard viewer="driver" pricing={pricing} pointBalance={0}
      product={{ ...product, can_afford: false, is_available: false }} />);
    expect(screen.getByRole('listitem')).toHaveClass('is-unavailable', 'is-unaffordable');
    const more = screen.getByRole('button', { name: 'Show more of the description for Mug' });
    expect(more).toBeEnabled();
    // Unavailable rewards remain browsable, but never expose purchase actions.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Show less of the description for Mug' })).toHaveAttribute('aria-expanded', 'true');
  } finally {
    clipped.mockRestore();
    full.mockRestore();
  }
});
