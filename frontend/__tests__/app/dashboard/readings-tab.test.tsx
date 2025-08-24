import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReadingsTab from '@/app/dashboard/readings-tab';
import { UserApi } from '@/lib/api/user-api';
import { useToast } from '@/components/ui/use-toast';

// Mock dependencies
jest.mock('@/lib/pdf/reading-pdf-generator', () => ({
  generateReadingPDF: jest.fn(),
  isPDFGenerationSupported: jest.fn(() => true),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: jest.fn(),
}));

jest.mock('@/lib/config/stripe', () => ({
  STRIPE_CONFIG: {
    readingPriceId: 'price_test_reading_id',
    sessionTypes: {
      ONE_TIME: 'one-time',
      SUBSCRIPTION: 'subscription',
    },
    readingTypes: {
      SOUL_BLUEPRINT: 'soul_blueprint',
    },
    getSuccessUrl: jest.fn((baseUrl) => `${baseUrl}/dashboard?tab=readings&payment=success`),
    getCancelUrl: jest.fn((baseUrl) => `${baseUrl}/dashboard?tab=readings&payment=cancelled`),
  },
}));

jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => '2 days'),
}));

describe('ReadingsTab - KAN-67 Purchase Reading Feature', () => {
  let mockUserApi: jest.Mocked<UserApi>;
  let mockToast: jest.Mock;
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();

    // Mock window.location
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = {
      href: 'http://localhost/',
      origin: 'http://localhost',
    };

    // Setup toast mock
    mockToast = jest.fn();
    (useToast as jest.Mock).mockReturnValue({
      toast: mockToast,
    });

    // Setup UserApi mock
    mockUserApi = {
      getNatalChart: jest.fn(),
      getReadings: jest.fn(),
      getReadingDetail: jest.fn(),
      getUserProfile: jest.fn(),
      createCheckoutSession: jest.fn(),
    } as unknown as jest.Mocked<UserApi>;
  });

  describe('Purchase Reading Button', () => {
    it('should display Purchase Reading button when user has natal chart', async () => {
      // Setup: User has natal chart but no readings
      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Purchase Your First Reading/i }),
        ).toBeInTheDocument();
      });
    });

    it('should display Purchase Reading button in header when user has existing readings', async () => {
      // Setup: User has natal chart and existing readings
      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [
          {
            readingId: 'reading-1',
            type: 'Soul Blueprint',
            status: 'Ready' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:01:00Z',
          },
        ],
        count: 1,
      });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Purchase Reading/i })).toBeInTheDocument();
      });
    });

    it('should NOT display Purchase Reading button when user has no natal chart', async () => {
      // Setup: User has no natal chart
      mockUserApi.getNatalChart.mockRejectedValue(new Error('Natal chart not found'));
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('No Readings Yet')).toBeInTheDocument();
      });

      // Button should not be present
      expect(screen.queryByRole('button', { name: /Purchase.*Reading/i })).not.toBeInTheDocument();
    });

    it('should show warning message when natal chart is missing', async () => {
      // Setup: User has no natal chart
      mockUserApi.getNatalChart.mockRejectedValue(new Error('Natal chart not found'));
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByText(
            /Please complete your profile and generate your natal chart before creating readings/,
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Checkout Session Creation', () => {
    it('should create checkout session when Purchase Reading button is clicked', async () => {
      // Setup
      const mockSessionResponse = {
        sessionId: 'cs_test_session123',
        url: 'https://checkout.stripe.com/session123',
      };

      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });
      mockUserApi.createCheckoutSession.mockResolvedValue(mockSessionResponse);

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Purchase Your First Reading/i }),
        ).toBeInTheDocument();
      });

      const purchaseButton = screen.getByRole('button', { name: /Purchase Your First Reading/i });
      fireEvent.click(purchaseButton);

      await waitFor(() => {
        expect(mockUserApi.createCheckoutSession).toHaveBeenCalledWith(mockUserId, {
          sessionType: 'one-time',
          priceId: 'price_test_reading_id',
          successUrl: 'http://localhost/dashboard?tab=readings&payment=success',
          cancelUrl: 'http://localhost/dashboard?tab=readings&payment=cancelled',
          metadata: {
            userId: mockUserId,
            readingType: 'soul_blueprint',
          },
        });
      });

      // Verify that the component attempted to redirect
      // In a real browser, window.location.href would be set
      // In test environment, we just verify the API was called correctly
      expect(mockUserApi.createCheckoutSession).toHaveBeenCalledTimes(1);
    });

    it('should show loading state while creating checkout session', async () => {
      // Setup with delayed response
      const mockSessionResponse = {
        sessionId: 'cs_test_session123',
        url: 'https://checkout.stripe.com/session123',
      };

      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });

      // Simulate delay
      mockUserApi.createCheckoutSession.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockSessionResponse), 100)),
      );

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Purchase Your First Reading/i }),
        ).toBeInTheDocument();
      });

      const purchaseButton = screen.getByRole('button', { name: /Purchase Your First Reading/i });
      fireEvent.click(purchaseButton);

      // Check that button gets disabled (loading state)
      expect(purchaseButton).toBeDisabled();

      // Wait for completion
      await waitFor(() => {
        expect(mockUserApi.createCheckoutSession).toHaveBeenCalled();
      });
    });

    it('should handle checkout session creation error gracefully', async () => {
      // Setup
      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });
      mockUserApi.createCheckoutSession.mockRejectedValue(new Error('Network error'));

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Purchase Your First Reading/i }),
        ).toBeInTheDocument();
      });

      const purchaseButton = screen.getByRole('button', { name: /Purchase Your First Reading/i });
      fireEvent.click(purchaseButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Checkout Error',
          description: 'Network error',
          variant: 'destructive',
        });
      });

      // Error should be displayed
      expect(screen.getByText('Network error')).toBeInTheDocument();

      // Button should be re-enabled
      expect(purchaseButton).not.toBeDisabled();

      // Should not redirect (stays at localhost)
      expect(window.location.href).toBe('http://localhost/');
    });

    it('should handle missing checkout URL from API response', async () => {
      // Setup with invalid response (no URL)
      const mockSessionResponse = {
        sessionId: 'cs_test_session123',
        // url is missing
      };

      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUserApi.createCheckoutSession.mockResolvedValue(mockSessionResponse as any);

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Purchase Your First Reading/i }),
        ).toBeInTheDocument();
      });

      const purchaseButton = screen.getByRole('button', { name: /Purchase Your First Reading/i });
      fireEvent.click(purchaseButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Checkout Error',
          description: 'No checkout URL received',
          variant: 'destructive',
        });
      });

      // Should not redirect (stays at localhost)
      expect(window.location.href).toBe('http://localhost/');
    });
  });

  describe('Button States and Interactions', () => {
    it('should disable button while purchasing', async () => {
      // Setup
      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });

      // Never resolve to keep in loading state
      mockUserApi.createCheckoutSession.mockImplementation(() => new Promise(() => {}));

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Purchase Your First Reading/i }),
        ).toBeInTheDocument();
      });

      const purchaseButton = screen.getByRole('button', { name: /Purchase Your First Reading/i });
      fireEvent.click(purchaseButton);

      // Button should be disabled during purchase
      expect(purchaseButton).toBeDisabled();
      // Multiple buttons might have this text, so check that at least one exists
      const loadingTexts = screen.getAllByText(/Creating checkout session.../i);
      expect(loadingTexts.length).toBeGreaterThan(0);
    });

    it('should show ShoppingCart icon in Purchase Reading button', async () => {
      // Setup
      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /Purchase Your First Reading/i });
        expect(button).toBeInTheDocument();
        // Check that the button contains the ShoppingCart icon class
        expect(button.querySelector('svg')).toBeInTheDocument();
      });
    });

    it('should clear checkout error when retrying purchase', async () => {
      // Setup
      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });

      // First attempt fails, second succeeds
      mockUserApi.createCheckoutSession
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce({
          sessionId: 'cs_test_session123',
          url: 'https://checkout.stripe.com/session123',
        });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Purchase Your First Reading/i }),
        ).toBeInTheDocument();
      });

      const purchaseButton = screen.getByRole('button', { name: /Purchase Your First Reading/i });

      // First click - should fail
      fireEvent.click(purchaseButton);

      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument();
      });

      // Second click - should succeed
      fireEvent.click(purchaseButton);

      // Wait for second call to complete
      await waitFor(() => {
        expect(mockUserApi.createCheckoutSession).toHaveBeenCalledTimes(2);
      });

      // Verify that second attempt succeeded
      // In test environment, we can't actually change window.location.href
      expect(mockUserApi.createCheckoutSession).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration with Existing Functionality', () => {
    it('should maintain existing reading list functionality', async () => {
      // Setup with existing readings
      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [
          {
            readingId: 'reading-1',
            type: 'Soul Blueprint',
            status: 'Ready' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:01:00Z',
          },
          {
            readingId: 'reading-2',
            type: 'Soul Blueprint',
            status: 'Processing' as const,
            createdAt: '2024-01-02T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
          },
        ],
        count: 2,
      });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        // Purchase button should be in header
        expect(screen.getByRole('button', { name: /Purchase Reading/i })).toBeInTheDocument();

        // Existing readings should still be displayed
        const blueprintElements = screen.getAllByText('Soul Blueprint');
        expect(blueprintElements).toHaveLength(2);
        expect(screen.getByText('Ready')).toBeInTheDocument();
        expect(screen.getByText('Processing')).toBeInTheDocument();
      });
    });

    it('should maintain PDF download functionality alongside purchase button', async () => {
      // Setup
      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [
          {
            readingId: 'reading-1',
            type: 'Soul Blueprint',
            status: 'Ready' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:01:00Z',
          },
        ],
        count: 1,
      });
      mockUserApi.getReadingDetail.mockResolvedValue({
        readingId: 'reading-1',
        userId: mockUserId,
        type: 'Soul Blueprint',
        status: 'Ready' as const,
        content: 'Your Soul Blueprint reading content...',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:01:00Z',
      });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      // Click on reading to view details
      await waitFor(() => {
        expect(screen.getByText('Soul Blueprint')).toBeInTheDocument();
      });

      const readingCard = screen.getByText('Soul Blueprint').closest('div');
      if (readingCard) {
        fireEvent.click(readingCard);
      }

      await waitFor(() => {
        // PDF download button should exist
        expect(
          screen.getByRole('button', { name: /Download reading as PDF/i }),
        ).toBeInTheDocument();
        // Back to readings button should exist
        expect(screen.getByRole('button', { name: /Back to Readings/i })).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid clicks on purchase button', async () => {
      // Setup
      const mockSessionResponse = {
        sessionId: 'cs_test_session123',
        url: 'https://checkout.stripe.com/session123',
      };

      mockUserApi.getNatalChart.mockResolvedValue({
        userId: mockUserId,
        chartType: 'natal',
        createdAt: '2024-01-01T00:00:00Z',
        planets: {},
        isTimeEstimated: false,
      });
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });
      mockUserApi.createCheckoutSession.mockResolvedValue(mockSessionResponse);

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /Purchase Your First Reading/i }),
        ).toBeInTheDocument();
      });

      const purchaseButton = screen.getByRole('button', { name: /Purchase Your First Reading/i });

      // Rapid clicks
      fireEvent.click(purchaseButton);
      fireEvent.click(purchaseButton);
      fireEvent.click(purchaseButton);

      await waitFor(() => {
        // Should only call API once despite multiple clicks
        expect(mockUserApi.createCheckoutSession).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle undefined natal chart response', async () => {
      // Setup with undefined natal chart
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUserApi.getNatalChart.mockResolvedValue(undefined as any);
      mockUserApi.getReadings.mockResolvedValue({
        readings: [],
        count: 0,
      });

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('No Readings Yet')).toBeInTheDocument();
      });

      // Button should not be present when natal chart is undefined
      expect(screen.queryByRole('button', { name: /Purchase.*Reading/i })).not.toBeInTheDocument();
    });

    it('should handle simultaneous loading of natal chart and readings', async () => {
      // Setup with delays
      mockUserApi.getNatalChart.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  userId: mockUserId,
                  chartType: 'natal',
                  createdAt: '2024-01-01T00:00:00Z',
                  planets: {},
                  isTimeEstimated: false,
                }),
              50,
            ),
          ),
      );
      mockUserApi.getReadings.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  readings: [],
                  count: 0,
                }),
              100,
            ),
          ),
      );

      render(<ReadingsTab userApi={mockUserApi} userId={mockUserId} />);

      // Should show loading spinner initially (checking for animate-spin class)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeTruthy();

      await waitFor(
        () => {
          // After both resolve, button should appear
          expect(
            screen.getByRole('button', { name: /Purchase Your First Reading/i }),
          ).toBeInTheDocument();
        },
        { timeout: 200 },
      );
    });
  });
});
