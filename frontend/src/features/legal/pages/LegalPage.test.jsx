import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { PrivacyPage, TermsPage } from './LegalPage';

function renderLegalPage(page) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {page}
    </MemoryRouter>,
  );
}

test('renders the course-project terms with a privacy link', () => {
  renderLegalPage(<TermsPage />);

  expect(screen.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeInTheDocument();
  expect(screen.getByText('Course-project notice')).toBeInTheDocument();
  screen
    .getAllByRole('link', { name: 'Privacy Notice' })
    .forEach((link) => expect(link).toHaveAttribute('href', '/privacy'));
});

test('renders the privacy notice with the current data-practice sections', () => {
  renderLegalPage(<PrivacyPage />);

  expect(screen.getByRole('heading', { name: 'Privacy Notice', level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '2. Information we collect' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '7. Security' })).toBeInTheDocument();
  expect(screen.getByText(/does not currently sell personal information/i)).toBeInTheDocument();
});
