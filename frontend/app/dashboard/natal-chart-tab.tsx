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

          {/* Angular Points Section */}
          {(chart.ascendant || chart.midheaven || chart.additionalPoints) && (
            <div className="mb-6">
              <h4 className="mb-4 text-lg font-semibold">Angular Points</h4>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                {chart.additionalPoints?.descendant && (
                  <div className="rounded-lg border bg-blue-50/50 p-4 dark:bg-blue-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Descendant
                        </span>
                        <div className="mt-1 text-lg font-semibold">
                          {formatDegree(
                            chart.additionalPoints.descendant.degreeInSign,
                            chart.additionalPoints.descendant.minutes,
                            chart.additionalPoints.descendant.sign,
                          )}
                        </div>
                      </div>
                      <div className="text-2xl">↙️</div>
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
                {chart.additionalPoints?.imumCoeli && (
                  <div className="rounded-lg border bg-purple-50/50 p-4 dark:bg-purple-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Imum Coeli (IC)
                        </span>
                        <div className="mt-1 text-lg font-semibold">
                          {formatDegree(
                            chart.additionalPoints.imumCoeli.degreeInSign,
                            chart.additionalPoints.imumCoeli.minutes,
                            chart.additionalPoints.imumCoeli.sign,
                          )}
                        </div>
                      </div>
                      <div className="text-2xl">⬇️</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Special Points Section */}
          {(chart.additionalPoints?.partOfFortune || chart.additionalPoints?.vertex) && (
            <div className="mb-6">
              <h4 className="mb-4 text-lg font-semibold">Special Points</h4>
              <div className="grid gap-4 md:grid-cols-2">
                {chart.additionalPoints.partOfFortune && (
                  <div className="rounded-lg border bg-green-50/50 p-4 dark:bg-green-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Part of Fortune
                        </span>
                        <div className="mt-1 text-lg font-semibold">
                          {formatDegree(
                            chart.additionalPoints.partOfFortune.degreeInSign,
                            chart.additionalPoints.partOfFortune.minutes,
                            chart.additionalPoints.partOfFortune.sign,
                          )}
                        </div>
                      </div>
                      <div className="text-2xl">⊕</div>
                    </div>
                  </div>
                )}
                {chart.additionalPoints.vertex && (
                  <div className="rounded-lg border bg-green-50/50 p-4 dark:bg-green-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          Vertex
                        </span>
                        <div className="mt-1 text-lg font-semibold">
                          {formatDegree(
                            chart.additionalPoints.vertex.degreeInSign,
                            chart.additionalPoints.vertex.minutes,
                            chart.additionalPoints.vertex.sign,
                          )}
                        </div>
                      </div>
                      <div className="text-2xl">◊</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lunar Nodes Section */}
          {(chart.additionalPoints?.northNode || chart.additionalPoints?.southNode) && (
            <div className="mb-6">
              <h4 className="mb-4 text-lg font-semibold">Lunar Nodes</h4>
              <div className="grid gap-4 md:grid-cols-2">
                {chart.additionalPoints.northNode && (
                  <div className="rounded-lg border bg-amber-50/50 p-4 dark:bg-amber-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          North Node
                        </span>
                        <div className="mt-1 text-lg font-semibold">
                          {formatDegree(
                            chart.additionalPoints.northNode.degreeInSign,
                            chart.additionalPoints.northNode.minutes,
                            chart.additionalPoints.northNode.sign,
                          )}
                        </div>
                      </div>
                      <div className="text-2xl">☊</div>
                    </div>
                  </div>
                )}
                {chart.additionalPoints.southNode && (
                  <div className="rounded-lg border bg-amber-50/50 p-4 dark:bg-amber-900/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                          South Node
                        </span>
                        <div className="mt-1 text-lg font-semibold">
                          {formatDegree(
                            chart.additionalPoints.southNode.degreeInSign,
                            chart.additionalPoints.southNode.minutes,
                            chart.additionalPoints.southNode.sign,
                          )}
                        </div>
                      </div>
                      <div className="text-2xl">☋</div>
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

      {/* Asteroids & Minor Bodies Section */}
      {chart.asteroids && (
        <Card>
          <CardHeader>
            <CardTitle>Asteroids & Minor Bodies</CardTitle>
            <CardDescription>
              Additional celestial bodies that influence your astrological profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Sign</th>
                    <th className="p-2 text-left">Degree</th>
                  </tr>
                </thead>
                <tbody>
                  {chart.asteroids.ceres && chart.asteroids.ceres.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.ceres.name}</td>
                      <td className="p-2">{chart.asteroids.ceres.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.ceres.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.ceres.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.pallas && chart.asteroids.pallas.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.pallas.name}</td>
                      <td className="p-2">{chart.asteroids.pallas.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.pallas.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.pallas.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.juno && chart.asteroids.juno.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.juno.name}</td>
                      <td className="p-2">{chart.asteroids.juno.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.juno.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.juno.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.vesta && chart.asteroids.vesta.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.vesta.name}</td>
                      <td className="p-2">{chart.asteroids.vesta.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.vesta.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.vesta.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.eris && chart.asteroids.eris.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.eris.name}</td>
                      <td className="p-2">{chart.asteroids.eris.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.eris.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.eris.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.pholus && chart.asteroids.pholus.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.pholus.name}</td>
                      <td className="p-2">{chart.asteroids.pholus.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.pholus.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.pholus.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.nessus && chart.asteroids.nessus.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.nessus.name}</td>
                      <td className="p-2">{chart.asteroids.nessus.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.nessus.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.nessus.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.ixion && chart.asteroids.ixion.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.ixion.name}</td>
                      <td className="p-2">{chart.asteroids.ixion.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.ixion.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.ixion.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.orcus && chart.asteroids.orcus.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.orcus.name}</td>
                      <td className="p-2">{chart.asteroids.orcus.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.orcus.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.orcus.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.quaoar && chart.asteroids.quaoar.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.quaoar.name}</td>
                      <td className="p-2">{chart.asteroids.quaoar.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.quaoar.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.quaoar.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.sedna && chart.asteroids.sedna.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.sedna.name}</td>
                      <td className="p-2">{chart.asteroids.sedna.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.sedna.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.sedna.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                  {chart.asteroids.varuna && chart.asteroids.varuna.sign !== 'Unknown' && (
                    <tr className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2 font-medium">{chart.asteroids.varuna.name}</td>
                      <td className="p-2">{chart.asteroids.varuna.sign}</td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-400">
                        {chart.asteroids.varuna.degreeInSign.toString().padStart(2, '0')}°
                        {chart.asteroids.varuna.minutes.toString().padStart(2, '0')}&prime;
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
