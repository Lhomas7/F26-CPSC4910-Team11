import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../config/api';
import MfaPanel from './MfaPanel';

jest.mock('../config/api');

afterEach(() => jest.clearAllMocks());

test('formats a US phone number and submits normalized international form', async () => {
  api.mfaSetup.mockResolvedValue({ method: 'sms' });
  render(<MfaPanel mfa={{ required: false, enrolled: false, methods: [] }} onRefreshed={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Phone number (for text message codes)'), { target: { value: '8645551234' } });
  expect(screen.getByLabelText('Phone number (for text message codes)')).toHaveValue('(864) 555-1234');
  fireEvent.click(screen.getByRole('button', { name: 'Turn on Text message' }));
  await waitFor(() => expect(api.mfaSetup).toHaveBeenCalledWith('sms', '+18645551234'));
});

test('uses the selected country code and removes an international trunk zero', async () => {
  api.mfaSetup.mockResolvedValue({ method: 'sms' });
  render(<MfaPanel mfa={{ required: false, enrolled: false, methods: [] }} onRefreshed={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Country code'), { target: { value: 'GB' } });
  fireEvent.change(screen.getByLabelText('Phone number (for text message codes)'), { target: { value: '02079460958' } });
  fireEvent.click(screen.getByRole('button', { name: 'Turn on Text message' }));
  await waitFor(() => expect(api.mfaSetup).toHaveBeenCalledWith('sms', '+442079460958'));
});

test('rejects an incomplete phone number before calling the API', () => {
  render(<MfaPanel mfa={{ required: false, enrolled: false, methods: [] }} onRefreshed={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Phone number (for text message codes)'), { target: { value: '555' } });
  fireEvent.click(screen.getByRole('button', { name: 'Turn on Text message' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid phone number');
  expect(api.mfaSetup).not.toHaveBeenCalled();
});
