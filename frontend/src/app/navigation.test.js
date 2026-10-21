import { navItemsFor } from './navigation';

const labels = (user) => navItemsFor(user).map((item) => item.label);

test('each account type gets its own sidebar', () => {
  expect(labels(null)).toEqual(['Home', 'About']);
  expect(labels({ account_type: 'driver' })).toEqual(['Home', 'Points', 'About']);
  expect(labels({ account_type: 'sponsor' })).toEqual(['Home', 'Points', 'Drivers', 'Catalog', 'About']);
  expect(labels({ account_type: 'admin' })).toEqual(['Home', 'Users', 'About']);
});

test('viewing as a sponsor includes Catalog while administrator navigation does not', () => {
  expect(labels({ account_type: 'sponsor', impersonation: { active: true } })).toContain('Catalog');
  expect(labels({ account_type: 'admin' })).not.toContain('Catalog');
});

test('viewing as someone shows their sidebar', () => {
  const adminViewingAsDriver = { account_type: 'driver', impersonation: { active: true } };

  expect(labels(adminViewingAsDriver)).toEqual(['Home', 'Points', 'About']);
});
