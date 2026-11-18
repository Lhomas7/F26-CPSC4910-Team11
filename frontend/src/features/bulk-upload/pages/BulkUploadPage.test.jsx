import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as api from 'api';
import { useAuth } from 'auth/AuthContext';
import BulkUploadPage from './BulkUploadPage';

jest.mock('api');
jest.mock('auth/AuthContext');

const report = (dryRun) => ({
  dry_run: dryRun,
  format: 'pipe',
  summary: {
    total_rows: 2,
    succeeded: 1,
    failed: 1,
    organizations_created: 0,
    drivers_created: 1,
    drivers_added: 0,
    sponsors_created: 0,
    points_awarded: 1,
    points_total: 500,
    invitations_sent: 1,
  },
  results: [
    { line: 1, type: 'D', status: 'created', subject: 'jane@example.com', message: 'New driver.' },
    {
      line: 2,
      type: 'D',
      status: 'error',
      message: 'Last name is required.',
      raw: 'D||Bob||bob@example.com',
      errors: [{ field: 'last_name', message: 'Last name is required.' }],
    },
  ],
});

const file = new File(['D||Jane|Doe|jane@example.com'], 'people.txt', { type: 'text/plain' });

afterEach(() => jest.resetAllMocks());

test('a sponsor checks a file and sees problems by line without saving anything', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  api.uploadBulkFile.mockResolvedValue(report(true));
  render(<BulkUploadPage />);

  await userEvent.upload(screen.getByLabelText(/File \(/), file);
  await userEvent.click(screen.getByRole('button', { name: 'Check file' }));

  expect(api.uploadBulkFile).toHaveBeenCalledWith(file, { dryRun: true });
  expect(await screen.findByText(/Nothing has been saved yet/)).toBeInTheDocument();
  expect(screen.getByText('Line 2')).toBeInTheDocument();
  expect(screen.getByText('D||Bob||bob@example.com')).toBeInTheDocument();
  expect(screen.getByText(/last name: Last name is required\./)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download these lines' })).toBeInTheDocument();
});

test('uploading reports what was saved and keeps the good lines', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  api.uploadBulkFile.mockResolvedValue(report(false));
  render(<BulkUploadPage />);

  await userEvent.upload(screen.getByLabelText(/File \(/), file);
  await userEvent.click(screen.getByRole('button', { name: 'Upload file' }));

  expect(api.uploadBulkFile).toHaveBeenCalledWith(file, { dryRun: false });
  expect(await screen.findByText(/The lines that worked were saved/)).toBeInTheDocument();
});

test('asks for a file and shows file-level errors', async () => {
  useAuth.mockReturnValue({ user: { account_type: 'admin' } });
  api.uploadBulkFile.mockRejectedValue(new Error('The file is empty.'));
  render(<BulkUploadPage />);

  await userEvent.click(screen.getByRole('button', { name: 'Upload file' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a file first.');

  await userEvent.upload(screen.getByLabelText(/File \(/), file);
  await userEvent.click(screen.getByRole('button', { name: 'Upload file' }));
  expect(await screen.findByText('The file is empty.')).toBeInTheDocument();
});

test('only administrators are told about organization lines', () => {
  useAuth.mockReturnValue({ user: { account_type: 'sponsor' } });
  const { unmount } = render(<BulkUploadPage />);
  expect(screen.queryByText(/creates an organization/)).not.toBeInTheDocument();
  unmount();

  useAuth.mockReturnValue({ user: { account_type: 'admin' } });
  render(<BulkUploadPage />);
  expect(screen.getByText(/creates an organization/)).toBeInTheDocument();
});
