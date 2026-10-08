import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as api from '../../../api';
import PointAdjustmentPanel from './PointAdjustmentPanel';

jest.mock('../../../api');

afterEach(() => jest.clearAllMocks());

test('awards points with a normalized required reason', async () => {
  const onAdjusted = jest.fn();
  api.adjustDriverPoints.mockResolvedValue({ balance: 125, transaction: { id: 1 } });
  render(<PointAdjustmentPanel driverId={7} driverName="Jamie Rivera" balance={25} onAdjusted={onAdjusted} />);

  fireEvent.change(screen.getByLabelText('Points'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  Excellent   safety record  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Award points' }));

  await waitFor(() => expect(api.adjustDriverPoints).toHaveBeenCalledWith(7, 100, 'Excellent safety record'));
  expect(onAdjusted).toHaveBeenCalledWith(125);
  expect(await screen.findByRole('status')).toHaveTextContent("100 points awarded. Jamie Rivera's balance is now 125 points.");
});

test('requires an amount and reason before submitting', () => {
  render(<PointAdjustmentPanel driverId={7} driverName="Jamie Rivera" balance={25} onAdjusted={jest.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Award points' }));

  expect(screen.getByText('Enter a whole number greater than zero.')).toBeInTheDocument();
  expect(screen.getByText('Enter a reason for this adjustment.')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing was saved. Fix the highlighted fields and try again.');
  expect(api.adjustDriverPoints).not.toHaveBeenCalled();
});

test('requires explicit confirmation before deducting points', async () => {
  const onAdjusted = jest.fn();
  api.adjustDriverPoints.mockResolvedValue({ balance: 30, transaction: { id: 2 } });
  render(<PointAdjustmentPanel driverId={7} driverName="Jamie Rivera" balance={50} onAdjusted={onAdjusted} />);

  fireEvent.click(screen.getByRole('button', { name: 'Deduct' }));
  fireEvent.change(screen.getByLabelText('Points'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Documented violation' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review deduction' }));

  expect(screen.getByRole('alertdialog')).toHaveTextContent('Deduct 20 points from Jamie Rivera? Their balance will go from 50 to 30 points.');
  expect(api.adjustDriverPoints).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm deduction' }));

  await waitFor(() => expect(api.adjustDriverPoints).toHaveBeenCalledWith(7, -20, 'Documented violation'));
  expect(onAdjusted).toHaveBeenCalledWith(30);
});

test('prevents a deduction larger than the displayed balance', () => {
  render(<PointAdjustmentPanel driverId={7} driverName="Jamie Rivera" balance={25} onAdjusted={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Deduct' }));
  fireEvent.change(screen.getByLabelText('Points'), { target: { value: '26' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Adjustment' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review deduction' }));

  expect(screen.getByText('This driver only has 25 points available.')).toBeInTheDocument();
  expect(api.adjustDriverPoints).not.toHaveBeenCalled();
});

test('shows field feedback returned by the server', async () => {
  api.adjustDriverPoints.mockRejectedValue({
    message: 'Invalid request.',
    data: { point_change: ['This deduction exceeds the current balance.'] },
  });
  render(<PointAdjustmentPanel driverId={7} driverName="Jamie Rivera" balance={50} onAdjusted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Points'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Adjustment' } });
  fireEvent.click(screen.getByRole('button', { name: 'Award points' }));

  expect(await screen.findByText('This deduction exceeds the current balance.')).toBeInTheDocument();
});
