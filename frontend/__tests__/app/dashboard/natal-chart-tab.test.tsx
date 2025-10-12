import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import NatalChartTab from '@/app/dashboard/natal-chart-tab';
import { UserApi } from '@/lib/api/user-api';

// Mock dependencies
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">
      {children}
    </div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

describe('NatalChartTab - KAN-77 Additional Celestial Bodies', () => {
  let mockUserApi: jest.Mocked<UserApi>;
  const mockUserId = 'test-user-kan77';

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup UserApi mock
    mockUserApi = {
      getNatalChart: jest.fn(),
      getReadings: jest.fn(),
      getReadingDetail: jest.fn(),
      getUserProfile: jest.fn(),
      createCheckoutSession: jest.fn(),
    } as unknown as jest.Mocked<UserApi>;
  });

  describe('Angular Points Section', () => {
    it('should render all 4 angular points when data is available', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        ascendant: {
          degree: 100,
          sign: 'Cancer',
          degreeInSign: 10,
          minutes: 30,
        },
        midheaven: {
          degree: 200,
          sign: 'Libra',
          degreeInSign: 20,
          minutes: 45,
        },
        additionalPoints: {
          descendant: {
            degree: 280,
            sign: 'Capricorn',
            degreeInSign: 10,
            minutes: 30,
          },
          imumCoeli: {
            degree: 20,
            sign: 'Aries',
            degreeInSign: 20,
            minutes: 45,
          },
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Ascendant (Rising Sign)')).toBeInTheDocument();
        expect(screen.getByText('Descendant')).toBeInTheDocument();
        expect(screen.getByText('Midheaven (MC)')).toBeInTheDocument();
        expect(screen.getByText('Imum Coeli (IC)')).toBeInTheDocument();
      });

      // Verify all angular points are displayed
      expect(screen.getByText(/10°30′ Cancer/)).toBeInTheDocument();
      expect(screen.getByText(/10°30′ Capricorn/)).toBeInTheDocument();
      expect(screen.getByText(/20°45′ Libra/)).toBeInTheDocument();
      expect(screen.getByText(/20°45′ Aries/)).toBeInTheDocument();
    });

    it('should render only Ascendant and Midheaven when additional points are missing', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        ascendant: {
          degree: 100,
          sign: 'Cancer',
          degreeInSign: 10,
          minutes: 30,
        },
        midheaven: {
          degree: 200,
          sign: 'Libra',
          degreeInSign: 20,
          minutes: 45,
        },
        // No additionalPoints
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Ascendant (Rising Sign)')).toBeInTheDocument();
        expect(screen.getByText('Midheaven (MC)')).toBeInTheDocument();
      });

      // Additional points should not be present
      expect(screen.queryByText('Descendant')).not.toBeInTheDocument();
      expect(screen.queryByText('Imum Coeli (IC)')).not.toBeInTheDocument();
    });
  });

  describe('Special Points Section', () => {
    it('should render Part of Fortune and Vertex when available', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        additionalPoints: {
          descendant: {
            degree: 280,
            sign: 'Capricorn',
            degreeInSign: 10,
            minutes: 30,
          },
          imumCoeli: {
            degree: 20,
            sign: 'Aries',
            degreeInSign: 20,
            minutes: 45,
          },
          partOfFortune: {
            degree: 150,
            sign: 'Virgo',
            degreeInSign: 0,
            minutes: 15,
            name: 'Part of Fortune',
          },
          vertex: {
            degree: 240,
            sign: 'Sagittarius',
            degreeInSign: 0,
            minutes: 0,
          },
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Special Points')).toBeInTheDocument();
        expect(screen.getByText('Part of Fortune')).toBeInTheDocument();
        expect(screen.getByText('Vertex')).toBeInTheDocument();
      });

      // Verify special points are formatted correctly
      expect(screen.getByText(/00°15′ Virgo/)).toBeInTheDocument();
      expect(screen.getByText(/00°00′ Sagittarius/)).toBeInTheDocument();
    });

    it('should not render Special Points section when data is missing', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        // No additionalPoints at all
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.queryByText('Special Points')).not.toBeInTheDocument();
      });
    });
  });

  describe('Lunar Nodes Section', () => {
    it('should render North Node and South Node when available', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        additionalPoints: {
          descendant: {
            degree: 280,
            sign: 'Capricorn',
            degreeInSign: 10,
            minutes: 30,
          },
          imumCoeli: {
            degree: 20,
            sign: 'Aries',
            degreeInSign: 20,
            minutes: 45,
          },
          northNode: {
            degree: 120,
            sign: 'Leo',
            degreeInSign: 0,
            minutes: 0,
            name: 'North Node',
          },
          southNode: {
            degree: 300,
            sign: 'Aquarius',
            degreeInSign: 0,
            minutes: 0,
            name: 'South Node',
          },
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Lunar Nodes')).toBeInTheDocument();
        expect(screen.getByText('North Node')).toBeInTheDocument();
        expect(screen.getByText('South Node')).toBeInTheDocument();
      });

      // Verify nodes are formatted correctly
      expect(screen.getByText(/00°00′ Leo/)).toBeInTheDocument();
      expect(screen.getByText(/00°00′ Aquarius/)).toBeInTheDocument();
    });

    it('should not render Lunar Nodes section when data is missing', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        additionalPoints: {
          descendant: {
            degree: 280,
            sign: 'Capricorn',
            degreeInSign: 10,
            minutes: 30,
          },
          imumCoeli: {
            degree: 20,
            sign: 'Aries',
            degreeInSign: 20,
            minutes: 45,
          },
          // No nodes
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.queryByText('Lunar Nodes')).not.toBeInTheDocument();
      });
    });
  });

  describe('Asteroids & Minor Bodies Section', () => {
    it('should render all asteroids when data is available', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        asteroids: {
          ceres: {
            degree: 15,
            sign: 'Aries',
            degreeInSign: 15,
            minutes: 0,
            name: 'Ceres',
          },
          pallas: {
            degree: 45,
            sign: 'Taurus',
            degreeInSign: 15,
            minutes: 30,
            name: 'Pallas Athene',
          },
          juno: {
            degree: 75,
            sign: 'Gemini',
            degreeInSign: 15,
            minutes: 45,
            name: 'Juno',
          },
          vesta: {
            degree: 105,
            sign: 'Cancer',
            degreeInSign: 15,
            minutes: 0,
            name: 'Vesta',
          },
          eris: {
            degree: 135,
            sign: 'Leo',
            degreeInSign: 15,
            minutes: 0,
            name: 'Eris',
          },
          pholus: {
            degree: 165,
            sign: 'Virgo',
            degreeInSign: 15,
            minutes: 0,
            name: 'Pholus',
          },
          nessus: {
            degree: 195,
            sign: 'Libra',
            degreeInSign: 15,
            minutes: 0,
            name: 'Nessus',
          },
          ixion: {
            degree: 225,
            sign: 'Scorpio',
            degreeInSign: 15,
            minutes: 0,
            name: 'Ixion',
          },
          orcus: {
            degree: 255,
            sign: 'Sagittarius',
            degreeInSign: 15,
            minutes: 0,
            name: 'Orcus',
          },
          quaoar: {
            degree: 285,
            sign: 'Capricorn',
            degreeInSign: 15,
            minutes: 0,
            name: 'Quaoar',
          },
          sedna: {
            degree: 315,
            sign: 'Aquarius',
            degreeInSign: 15,
            minutes: 0,
            name: 'Sedna',
          },
          varuna: {
            degree: 345,
            sign: 'Pisces',
            degreeInSign: 15,
            minutes: 0,
            name: 'Varuna',
          },
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Asteroids & Minor Bodies')).toBeInTheDocument();
      });

      // Verify all asteroid names are displayed
      expect(screen.getByText('Ceres')).toBeInTheDocument();
      expect(screen.getByText('Pallas Athene')).toBeInTheDocument();
      expect(screen.getByText('Juno')).toBeInTheDocument();
      expect(screen.getByText('Vesta')).toBeInTheDocument();
      expect(screen.getByText('Eris')).toBeInTheDocument();
      expect(screen.getByText('Pholus')).toBeInTheDocument();
      expect(screen.getByText('Nessus')).toBeInTheDocument();
      expect(screen.getByText('Ixion')).toBeInTheDocument();
      expect(screen.getByText('Orcus')).toBeInTheDocument();
      expect(screen.getByText('Quaoar')).toBeInTheDocument();
      expect(screen.getByText('Sedna')).toBeInTheDocument();
      expect(screen.getByText('Varuna')).toBeInTheDocument();
    });

    it('should filter out asteroids with Unknown sign', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        asteroids: {
          ceres: {
            degree: 15,
            sign: 'Aries',
            degreeInSign: 15,
            minutes: 0,
            name: 'Ceres',
          },
          pallas: {
            degree: 0,
            sign: 'Unknown', // Should be filtered out
            degreeInSign: 0,
            minutes: 0,
            name: 'Pallas Athene',
          },
          juno: {
            degree: 75,
            sign: 'Gemini',
            degreeInSign: 15,
            minutes: 45,
            name: 'Juno',
          },
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Ceres')).toBeInTheDocument();
        expect(screen.getByText('Juno')).toBeInTheDocument();
      });

      // Pallas Athene with Unknown sign should not be displayed
      expect(screen.queryByText('Pallas Athene')).not.toBeInTheDocument();
    });

    it('should not render Asteroids section when data is missing', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        // No asteroids field
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.queryByText('Asteroids & Minor Bodies')).not.toBeInTheDocument();
      });
    });
  });

  describe('Backwards Compatibility', () => {
    it('should render old charts without new fields correctly', async () => {
      const mockOldChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2023-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {
          sun: {
            longitude: 10,
            sign: 'Aries',
            degreeInSign: 10,
            minutes: 0,
            name: 'Sun',
          },
        },
        ascendant: {
          degree: 100,
          sign: 'Cancer',
          degreeInSign: 10,
          minutes: 30,
        },
        midheaven: {
          degree: 200,
          sign: 'Libra',
          degreeInSign: 20,
          minutes: 45,
        },
        // No additionalPoints
        // No asteroids
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockOldChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Your Natal Chart')).toBeInTheDocument();
        expect(screen.getByText('Ascendant (Rising Sign)')).toBeInTheDocument();
        expect(screen.getByText('Midheaven (MC)')).toBeInTheDocument();
        expect(screen.getByText('Planetary Positions')).toBeInTheDocument();
      });

      // New sections should not appear
      expect(screen.queryByText('Special Points')).not.toBeInTheDocument();
      expect(screen.queryByText('Lunar Nodes')).not.toBeInTheDocument();
      expect(screen.queryByText('Asteroids & Minor Bodies')).not.toBeInTheDocument();
    });

    it('should render new charts with schemaVersion 2.0.0', async () => {
      const mockNewChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        metadata: {
          calculationTimestamp: '2024-01-01T00:00:00Z',
          ephemerisVersion: '2.10.03',
          swetestVersion: '2.10.03',
          houseSystem: 'placidus',
          zodiacType: 'tropical',
          schemaVersion: '2.0.0',
        },
        additionalPoints: {
          descendant: {
            degree: 280,
            sign: 'Capricorn',
            degreeInSign: 10,
            minutes: 30,
          },
          imumCoeli: {
            degree: 20,
            sign: 'Aries',
            degreeInSign: 20,
            minutes: 45,
          },
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockNewChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText('Your Natal Chart')).toBeInTheDocument();
      });

      // Schema version should not break rendering
      expect(screen.queryByText('2.0.0')).not.toBeInTheDocument(); // Schema version not displayed in UI
    });
  });

  describe('Loading and Error States', () => {
    it('should show loading state initially', () => {
      mockUserApi.getNatalChart.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      expect(screen.getByText('Generating your natal chart...')).toBeInTheDocument();
    });

    it('should show error state when chart fails to load', async () => {
      mockUserApi.getNatalChart.mockRejectedValue(new Error('Failed to load natal chart'));

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        expect(screen.getByText(/Error:/)).toBeInTheDocument();
        expect(screen.getByText(/Failed to load natal chart/)).toBeInTheDocument();
      });
    });
  });

  describe('Formatting and Display', () => {
    it('should format degrees with proper padding', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        ascendant: {
          degree: 5.5,
          sign: 'Aries',
          degreeInSign: 5,
          minutes: 30,
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        // Should pad to 2 digits: 05°30′
        expect(screen.getByText(/05°30′ Aries/)).toBeInTheDocument();
      });
    });

    it('should handle zero minutes correctly', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        ascendant: {
          degree: 10,
          sign: 'Taurus',
          degreeInSign: 10,
          minutes: 0,
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        // Should display: 10°00′
        expect(screen.getByText(/10°00′ Taurus/)).toBeInTheDocument();
      });
    });
  });

  describe('Responsive Design', () => {
    it('should render grid layouts for different sections', async () => {
      const mockChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {},
        ascendant: {
          degree: 100,
          sign: 'Cancer',
          degreeInSign: 10,
          minutes: 30,
        },
        midheaven: {
          degree: 200,
          sign: 'Libra',
          degreeInSign: 20,
          minutes: 45,
        },
        additionalPoints: {
          descendant: {
            degree: 280,
            sign: 'Capricorn',
            degreeInSign: 10,
            minutes: 30,
          },
          imumCoeli: {
            degree: 20,
            sign: 'Aries',
            degreeInSign: 20,
            minutes: 45,
          },
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockChart);

      const { container } = render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        // Check for grid layouts - Angular Points should use 4-column grid
        const gridElements = container.querySelectorAll('.grid');
        expect(gridElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Complete Chart Integration', () => {
    it('should render a complete chart with all new celestial bodies', async () => {
      const mockCompleteChart = {
        userId: mockUserId,
        chartType: 'natal' as const,
        createdAt: '2024-01-01T00:00:00Z',
        isTimeEstimated: false,
        planets: {
          sun: {
            longitude: 10,
            sign: 'Aries',
            degreeInSign: 10,
            minutes: 0,
            name: 'Sun',
          },
        },
        ascendant: {
          degree: 100,
          sign: 'Cancer',
          degreeInSign: 10,
          minutes: 30,
        },
        midheaven: {
          degree: 200,
          sign: 'Libra',
          degreeInSign: 20,
          minutes: 45,
        },
        additionalPoints: {
          descendant: {
            degree: 280,
            sign: 'Capricorn',
            degreeInSign: 10,
            minutes: 30,
          },
          imumCoeli: {
            degree: 20,
            sign: 'Aries',
            degreeInSign: 20,
            minutes: 45,
          },
          partOfFortune: {
            degree: 150,
            sign: 'Virgo',
            degreeInSign: 0,
            minutes: 15,
            name: 'Part of Fortune',
          },
          vertex: {
            degree: 240,
            sign: 'Sagittarius',
            degreeInSign: 0,
            minutes: 0,
          },
          northNode: {
            degree: 120,
            sign: 'Leo',
            degreeInSign: 0,
            minutes: 0,
            name: 'North Node',
          },
          southNode: {
            degree: 300,
            sign: 'Aquarius',
            degreeInSign: 0,
            minutes: 0,
            name: 'South Node',
          },
        },
        asteroids: {
          ceres: {
            degree: 15,
            sign: 'Aries',
            degreeInSign: 15,
            minutes: 0,
            name: 'Ceres',
          },
          pallas: {
            degree: 45,
            sign: 'Taurus',
            degreeInSign: 15,
            minutes: 30,
            name: 'Pallas Athene',
          },
          juno: {
            degree: 75,
            sign: 'Gemini',
            degreeInSign: 15,
            minutes: 45,
            name: 'Juno',
          },
          vesta: {
            degree: 105,
            sign: 'Cancer',
            degreeInSign: 15,
            minutes: 0,
            name: 'Vesta',
          },
          eris: {
            degree: 135,
            sign: 'Leo',
            degreeInSign: 15,
            minutes: 0,
            name: 'Eris',
          },
          pholus: {
            degree: 165,
            sign: 'Virgo',
            degreeInSign: 15,
            minutes: 0,
            name: 'Pholus',
          },
          nessus: {
            degree: 195,
            sign: 'Libra',
            degreeInSign: 15,
            minutes: 0,
            name: 'Nessus',
          },
          ixion: {
            degree: 225,
            sign: 'Scorpio',
            degreeInSign: 15,
            minutes: 0,
            name: 'Ixion',
          },
          orcus: {
            degree: 255,
            sign: 'Sagittarius',
            degreeInSign: 15,
            minutes: 0,
            name: 'Orcus',
          },
          quaoar: {
            degree: 285,
            sign: 'Capricorn',
            degreeInSign: 15,
            minutes: 0,
            name: 'Quaoar',
          },
          sedna: {
            degree: 315,
            sign: 'Aquarius',
            degreeInSign: 15,
            minutes: 0,
            name: 'Sedna',
          },
          varuna: {
            degree: 345,
            sign: 'Pisces',
            degreeInSign: 15,
            minutes: 0,
            name: 'Varuna',
          },
        },
        metadata: {
          calculationTimestamp: '2024-01-01T00:00:00Z',
          ephemerisVersion: '2.10.03',
          swetestVersion: '2.10.03',
          houseSystem: 'placidus',
          zodiacType: 'tropical',
          schemaVersion: '2.0.0',
        },
      };

      mockUserApi.getNatalChart.mockResolvedValue(mockCompleteChart);

      render(<NatalChartTab userApi={mockUserApi} userId={mockUserId} />);

      await waitFor(() => {
        // Verify all sections are rendered
        expect(screen.getByText('Angular Points')).toBeInTheDocument();
        expect(screen.getByText('Special Points')).toBeInTheDocument();
        expect(screen.getByText('Lunar Nodes')).toBeInTheDocument();
        expect(screen.getByText('Asteroids & Minor Bodies')).toBeInTheDocument();
        expect(screen.getByText('Planetary Positions')).toBeInTheDocument();

        // Verify key elements from each section
        expect(screen.getByText('Ascendant (Rising Sign)')).toBeInTheDocument();
        expect(screen.getByText('Part of Fortune')).toBeInTheDocument();
        expect(screen.getByText('North Node')).toBeInTheDocument();
        expect(screen.getByText('Ceres')).toBeInTheDocument();
      });
    });
  });
});
