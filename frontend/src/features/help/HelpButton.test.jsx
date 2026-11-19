import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as api from 'api';
import HelpButton from './HelpButton';

jest.mock('api');

afterEach(() => jest.resetAllMocks());

const contacts = {
  admin: { email: 'support@gooddriver.example.com', phone: '+18005550123' },
  sponsors: [
    {
      id: 2,
      name: 'Palmetto Freight',
      contact_name: 'Jordan Lee',
      email: 'help@palmetto.example.com',
      phone: '+18645550100',
      hours: 'Mon-Fri, 8am-5pm ET',
      active: true,
    },
    {
      id: 3,
      name: 'Coastal Carriers',
      contact_name: '',
      email: '',
      phone: '',
      hours: '',
      active: false,
    },
  ],
};

async function openHelp() {
  render(<HelpButton />);
  await userEvent.click(screen.getByRole('button', { name: 'Get help' }));
  return screen.findByRole('dialog', { name: 'Get help' });
}

test('opens a dialog with sponsor and site support contacts', async () => {
  api.getHelpContacts.mockResolvedValue(contacts);

  const dialog = await openHelp();

  const sponsors = await within(dialog).findAllByRole('listitem');
  expect(within(sponsors[0]).getByText('Current sponsor')).toBeInTheDocument();
  expect(within(sponsors[0]).getByText('Ask for Jordan Lee')).toBeInTheDocument();
  expect(within(sponsors[0]).getByRole('link', { name: '+18645550100' })).toHaveAttribute(
    'href',
    'tel:+18645550100',
  );
  expect(within(sponsors[1]).getByText(/hasn't added contact details/)).toBeInTheDocument();
  expect(
    within(dialog).getByRole('link', { name: 'support@gooddriver.example.com' }),
  ).toHaveAttribute('href', 'mailto:support@gooddriver.example.com');
});

test('explains when there is no sponsor or site contact yet', async () => {
  api.getHelpContacts.mockResolvedValue({ admin: { email: '', phone: '' }, sponsors: [] });

  const dialog = await openHelp();

  expect(await within(dialog).findByText(/aren't linked to a sponsor/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Site support hasn't added/)).toBeInTheDocument();
});

test('a failed load can be retried', async () => {
  api.getHelpContacts.mockRejectedValueOnce(new Error('Network error'));
  api.getHelpContacts.mockResolvedValueOnce(contacts);

  const dialog = await openHelp();
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Network error');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));

  expect(await within(dialog).findByText('Palmetto Freight')).toBeInTheDocument();
});

test('Close dismisses the dialog', async () => {
  api.getHelpContacts.mockResolvedValue(contacts);

  const dialog = await openHelp();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
