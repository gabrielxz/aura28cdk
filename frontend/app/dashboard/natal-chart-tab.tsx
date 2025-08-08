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

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Your Natal Chart</CardTitle>
        <CardDescription>Generated on {new Date(chart.createdAt).toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent>
        {chart.isTimeEstimated && (
          <div className="mb-4 rounded-lg border border-yellow-500/50 bg-yellow-50 p-4 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
            <p>
              <strong>Note:</strong> This chart was calculated with an estimated birth time of 12:00
              PM (noon). For a more accurate chart, please add your birth time in your profile.
            </p>
          </div>
        )}
        <h4 className="mb-2 text-lg font-semibold">Planetary Positions</h4>
        <pre className="overflow-x-auto rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
          <code>{JSON.stringify(chart.planets, null, 2)}</code>
        </pre>
        <h4 className="mb-2 mt-4 text-lg font-semibold">House Cusps</h4>
        <pre className="overflow-x-auto rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
          <code>{JSON.stringify(chart.houses, null, 2)}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
