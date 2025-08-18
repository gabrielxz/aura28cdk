import { render, screen } from '@testing-library/react';
import Home from '@/app/page';
import { useAuth } from '@/lib/auth/use-auth';

// Mock the auth hook
jest.mock('@/lib/auth/use-auth');

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}));

describe('Home Page', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      login: jest.fn(),
    });
  });

  it('renders Aura28 heading', () => {
    render(<Home />);

    const heading = screen.getByRole('heading', {
      name: /aura28/i,
    });

    expect(heading).toBeInTheDocument();
  });

  it('renders coming soon message', () => {
    render(<Home />);

    const comingSoonText = screen.getByText(/your personalized astrology readings are on the way/i);

    expect(comingSoonText).toBeInTheDocument();
  });

  it('renders launch soon message', () => {
    render(<Home />);

    const launchText = screen.getByText(/we.*re preparing to launch soon/i);

    expect(launchText).toBeInTheDocument();
  });

  it('renders contact email', () => {
    render(<Home />);

    const contactText = screen.getByText(/contact: support@aura28.com/i);

    expect(contactText).toBeInTheDocument();
  });
});
