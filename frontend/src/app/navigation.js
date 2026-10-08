// Who can see what. The sidebar is built from this list and the routes use
// the same role lists, so a link never shows up for a page that would refuse
// you. (The server still checks every request; hiding a link isn't security.)
// 'guest' means signed out. Catalog, Cart, Orders and Reports join later.
export const NAV_ITEMS = [
  { to: '/', label: 'Home', roles: ['guest', 'driver', 'sponsor', 'admin'] },
  { to: '/points', label: 'Points', roles: ['driver', 'sponsor'] },
  { to: '/drivers', label: 'Drivers', roles: ['sponsor'] },
  { to: '/users', label: 'Users', roles: ['admin'] },
  { to: '/about', label: 'About', roles: ['guest', 'driver', 'sponsor', 'admin'] },
];

// Role lists for the signed-in-only pages, shared with AppRoutes.
export const PAGE_ROLES = {
  points: ['driver', 'sponsor'],
  drivers: ['sponsor'],
  users: ['admin'],
};

/** The role the navigation should use for this user ('guest' when signed out). */
export function navRole(user) {
  return user?.account_type || 'guest';
}

/** Sidebar items for this user. While viewing as someone, it's their sidebar. */
export function navItemsFor(user) {
  const role = navRole(user);
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
