import { render, screen } from '@testing-library/react';
import Home from '@/app/page';
import { useAuth } from '@/lib/auth/use-auth';

// Mock the auth hook
jest.mock('@/lib/auth/use-auth');

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('Home Page', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      login: jest.fn(),
    });
  });

  it('renders Hello Carri heading', () => {
    render(<Home />);

    const heading = screen.getByRole('heading', {
      name: /hello carri/i,
    });

    expect(heading).toBeInTheDocument();
  });

  it('renders welcome message', () => {
    render(<Home />);

    const welcomeText = screen.getByText(/welcome to aura28/i);

    expect(welcomeText).toBeInTheDocument();
  });

  it('renders Get Started button', () => {
    render(<Home />);

    const getStartedButton = screen.getByRole('button', {
      name: /get started/i,
    });

    expect(getStartedButton).toBeInTheDocument();
  });

  it('renders Learn More button', () => {
    render(<Home />);

    const learnMoreButton = screen.getByRole('button', {
      name: /learn more/i,
    });

    expect(learnMoreButton).toBeInTheDocument();
  });

  it('renders features message', () => {
    render(<Home />);

    const featuresText = screen.getByText(/Features: User authentication with AWS Cognito/i);

    expect(featuresText).toBeInTheDocument();
  });
});
