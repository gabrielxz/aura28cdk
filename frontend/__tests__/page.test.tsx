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

  it('renders main heading', () => {
    render(<Home />);

    const heading = screen.getByRole('heading', {
      name: /your personal blueprint revealed/i,
    });

    expect(heading).toBeInTheDocument();
  });

  it('renders subheading', () => {
    render(<Home />);

    const subheadingText = screen.getByText(
      /a reflection of yourself like you.*ve never seen before/i,
    );

    expect(subheadingText).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(<Home />);

    const descriptionText = screen.getByText(
      /this isn.*t some generic feel-good spiel or vague horoscope/i,
    );

    expect(descriptionText).toBeInTheDocument();
  });

  it('renders discover button', () => {
    render(<Home />);

    const button = screen.getByRole('button', {
      name: /discover your blueprint/i,
    });

    expect(button).toBeInTheDocument();
  });
});
