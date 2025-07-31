import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';

describe('Button Component', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', {
      name: /click me/i,
    });

    expect(button).toBeInTheDocument();
  });

  it('applies default variant styles', () => {
    render(<Button>Default Button</Button>);

    const button = screen.getByRole('button');

    expect(button).toHaveClass('bg-primary');
  });

  it('applies outline variant styles', () => {
    render(<Button variant="outline">Outline Button</Button>);

    const button = screen.getByRole('button');

    expect(button).toHaveClass('border');
  });

  it('handles click events', async () => {
    const handleClick = jest.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);

    const button = screen.getByRole('button');
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    render(<Button disabled>Disabled Button</Button>);

    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
  });
});
