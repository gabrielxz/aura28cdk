import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

describe('Home Page', () => {
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

  it('renders coming soon message', () => {
    render(<Home />);

    const comingSoonText = screen.getByText(/coming soon/i);

    expect(comingSoonText).toBeInTheDocument();
  });
});
