'use client';

import { useEffect, useState } from 'react';
import { UserApi, NatalChart } from '@/lib/api/user-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface NatalChartTabProps {
  userApi: UserApi;
  userId: string;
}

export default function NatalChartTab({ userApi, userId }: NatalChartTabProps) {
  const [chart, setChart] = useState<NatalChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChart = async () => {
      try {
        setLoading(true);
        const natalChart = await userApi.getNatalChart(userId);
        setChart(natalChart);
        setError(null);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unknown error occurred.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchChart();
  }, [userId, userApi]);

  if (loading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Natal Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Generating your natal chart...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mt-6 border-red-500/50">
        <CardHeader>
          <CardTitle>Natal Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20 dark:text-red-400">
            <p>
              <strong>Error:</strong> {error}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!chart) {
    return null;
  }

  // Helper function to format degree display
  const formatDegree = (degreeInSign: number, minutes: number, sign: string) => {
    return `${degreeInSign.toString().padStart(2, '0')}°${minutes
      .toString()
      .padStart(2, '0')}′ ${sign}`;
  };

  return (
    <div className="space-y-6">
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Your Natal Chart</CardTitle>
          <CardDescription>
            Generated on {new Date(chart.createdAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chart.isTimeEstimated && (
            <div className="mb-4 rounded-lg border border-yellow-500/50 bg-yellow-50 p-4 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
              <p>
                <strong>Note:</strong> This chart was calculated with an estimated birth time of
                12:00 PM (noon). For a more accurate chart, please add your birth time in your
                profile.
              </p>
            </div>
          )}

          {/* Key Angles Section */}
          {(chart.ascendant || chart.midheaven) && (
            <div className="mb-6">
              <h4 className="mb-4 text-lg font-semibold">Key Angles</h4>
              <div className="grid gap-4 md:grid-cols-2">
                {chart.ascendant && (
                  <div className="rounded-lg border bg-blue-50/50 p-4 dark:bg-blue-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Ascendant (Rising Sign)
                        </span>
                        <div className="mt-1 text-lg font-semibold">
                          {formatDegree(
                            chart.ascendant.degreeInSign,
                            chart.ascendant.minutes,
                            chart.ascendant.sign,
                          )}
                        </div>
                      </div>
                      <div className="text-2xl">↗️</div>
                    </div>
                  </div>
                )}
                {chart.midheaven && (
                  <div className="rounded-lg border bg-purple-50/50 p-4 dark:bg-purple-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Midheaven (MC)
                        </span>
                        <div className="mt-1 text-lg font-semibold">
                          {formatDegree(
                            chart.midheaven.degreeInSign,
                            chart.midheaven.minutes,
                            chart.midheaven.sign,
                          )}
                        </div>
                      </div>
                      <div className="text-2xl">⬆️</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Planetary Positions with Houses */}
          <h4 className="mb-4 text-lg font-semibold">Planetary Positions</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Planet</th>
                  <th className="p-2 text-left">Sign</th>
                  <th className="p-2 text-left">Degree</th>
                  {chart.planetHouses && <th className="p-2 text-left">House</th>}
                </tr>
              </thead>
              <tbody>
                {chart.planets &&
                  Object.entries(chart.planets).map(([planetKey, planetData]) => (
                    <tr
                      key={planetKey}
                      className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="p-2 font-medium capitalize">{planetData.name || planetKey}</td>
                      <td className="p-2">{planetData.sign || ''}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {planetData.degreeInSign !== undefined && planetData.minutes !== undefined
                          ? `${planetData.degreeInSign.toString().padStart(2, '0')}°${planetData.minutes
                              .toString()
                              .padStart(2, '0')}'`
                          : ''}
                      </td>
                      {chart.planetHouses && (
                        <td className="p-2 text-center">{chart.planetHouses[planetKey] || '-'}</td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* House System Error */}
          {chart.houses?.status === 'failed' && (
            <div className="mt-4 rounded-lg border border-orange-500/50 bg-orange-50 p-4 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
              <p>
                <strong>Note:</strong> House calculations are temporarily unavailable.{' '}
                {chart.houses.error}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* House Cusps Card */}
      {chart.houses?.status === 'success' && chart.houses.data && (
        <Card>
          <CardHeader>
            <CardTitle>House Cusps</CardTitle>
            <CardDescription>Placidus House System</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {chart.houses.data.map((house) => (
                <div
                  key={house.houseNumber}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span className="font-medium">House {house.houseNumber}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {formatDegree(house.cuspDegreeInSign, house.cuspMinutes, house.cuspSign)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata Card */}
      {chart.metadata && (
        <Card>
          <CardHeader>
            <CardTitle>Calculation Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <p>
                <strong>House System:</strong> {chart.metadata.houseSystem || 'Placidus'}
              </p>
              <p>
                <strong>Zodiac Type:</strong> {chart.metadata.zodiacType || 'Tropical'}
              </p>
              <p>
                <strong>Ephemeris Version:</strong> {chart.metadata.ephemerisVersion}
              </p>
              <p>
                <strong>Swiss Ephemeris Version:</strong> {chart.metadata.swetestVersion}
              </p>
              <p>
                <strong>Calculation Time:</strong>{' '}
                {new Date(chart.metadata.calculationTimestamp).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
