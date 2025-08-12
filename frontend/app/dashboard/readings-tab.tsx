'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserApi } from '@/lib/api/user-api';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, BookOpen, Plus } from 'lucide-react';

interface Reading {
  readingId: string;
  type: string;
  status: 'Processing' | 'Ready' | 'Failed' | 'In Review';
  createdAt: string;
  updatedAt: string;
}

interface ReadingDetail extends Reading {
  content?: string;
  error?: string;
}

interface ReadingsTabProps {
  userApi: UserApi;
  userId: string;
}

export default function ReadingsTab({ userApi, userId }: ReadingsTabProps) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [selectedReading, setSelectedReading] = useState<ReadingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNatalChart, setHasNatalChart] = useState<boolean | null>(null);

  // Check if user has natal chart
  useEffect(() => {
    const checkNatalChart = async () => {
      try {
        const natalChart = await userApi.getNatalChart(userId);
        setHasNatalChart(!!natalChart);
      } catch (error) {
        console.error('Failed to check natal chart:', error);
        setHasNatalChart(false);
      }
    };
    checkNatalChart();
  }, [userApi, userId]);

  // Load readings list
  const loadReadings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await userApi.getReadings(userId);
      setReadings(data.readings);
    } catch (error) {
      console.error('Failed to load readings:', error);
      setError('Failed to load readings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReadings();
  }, [userApi, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate new reading
  const generateReading = async () => {
    try {
      setGenerating(true);
      setError(null);
      await userApi.generateReading(userId);
      // Reload readings list
      await loadReadings();
    } catch (error) {
      console.error('Failed to generate reading:', error);
      setError('Failed to generate reading. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Load reading detail
  const loadReadingDetail = async (readingId: string) => {
    try {
      const detail = await userApi.getReadingDetail(userId, readingId);
      setSelectedReading(detail);
    } catch (error) {
      console.error('Failed to load reading detail:', error);
      setError('Failed to load reading detail');
    }
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Ready':
        return 'bg-green-500';
      case 'Processing':
        return 'bg-yellow-500';
      case 'Failed':
        return 'bg-red-500';
      case 'In Review':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Show reading detail view
  if (selectedReading) {
    return (
      <div className="mt-6">
        <Button onClick={() => setSelectedReading(null)} variant="outline" className="mb-4">
          ← Back to Readings
        </Button>

        <Card className="p-6">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h3 className="text-2xl font-bold">{selectedReading.type}</h3>
              <p className="mt-1 text-sm text-gray-500">
                Created {formatDistanceToNow(new Date(selectedReading.createdAt))} ago
              </p>
            </div>
            <Badge className={getStatusColor(selectedReading.status)}>
              {selectedReading.status}
            </Badge>
          </div>

          {selectedReading.status === 'Ready' && selectedReading.content ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div className="whitespace-pre-wrap">{selectedReading.content}</div>
            </div>
          ) : selectedReading.status === 'Failed' ? (
            <div className="rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20">
              <p>Failed to generate reading: {selectedReading.error || 'Unknown error'}</p>
            </div>
          ) : selectedReading.status === 'Processing' ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin" />
                <p className="mt-4 text-gray-600">Your reading is being generated...</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-yellow-50 p-4 text-yellow-600 dark:bg-yellow-900/20">
              <p>Your reading is currently being reviewed and will be available soon.</p>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // Show readings list view
  return (
    <div className="mt-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-xl font-semibold">Your Readings</h3>
        <Button
          onClick={generateReading}
          disabled={generating || hasNatalChart === false}
          className="flex items-center gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Generate Reading
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20">
          <p>{error}</p>
        </div>
      )}

      {hasNatalChart === false && (
        <div className="mb-4 rounded-lg bg-yellow-50 p-4 text-yellow-600 dark:bg-yellow-900/20">
          <p>
            Please complete your profile and generate your natal chart before creating readings.
          </p>
        </div>
      )}

      {readings.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h4 className="mt-4 text-lg font-semibold">No Readings Yet</h4>
          <p className="mt-2 text-gray-600">
            Generate your first Soul Blueprint reading to discover your astrological insights.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {readings.map((reading) => (
            <Card
              key={reading.readingId}
              className="cursor-pointer p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => loadReadingDetail(reading.readingId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold">{reading.type}</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    Created {formatDistanceToNow(new Date(reading.createdAt))} ago
                  </p>
                </div>
                <Badge className={getStatusColor(reading.status)}>{reading.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
