'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserApi } from '@/lib/api/user-api';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, BookOpen, Download, ShoppingCart } from 'lucide-react';
import { generateReadingPDF, isPDFGenerationSupported } from '@/lib/pdf/reading-pdf-generator';
import { useToast } from '@/components/ui/use-toast';
import { STRIPE_CONFIG } from '@/lib/config/stripe';

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
  onNeedRefresh?: () => void;
}

export default function ReadingsTab({ userApi, userId, onNeedRefresh }: ReadingsTabProps) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [selectedReading, setSelectedReading] = useState<ReadingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNatalChart, setHasNatalChart] = useState<boolean | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [purchasingReading, setPurchasingReading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { toast } = useToast();

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
      // KAN-54: Sort readings by createdAt date in descending order (newest first)
      const sortedReadings = [...data.readings].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        // Handle invalid dates by treating them as very old dates
        const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
        const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
        return timeB - timeA;
      });
      setReadings(sortedReadings);
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

  // Trigger refresh when requested by parent
  useEffect(() => {
    if (onNeedRefresh) {
      loadReadings();
    }
  }, [onNeedRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reading generation has been removed - readings are now generated after payment
  // const generateReading = async () => {
  //   Reading generation is now handled automatically after successful payment
  // };

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

  // Handle purchase reading - creates Stripe checkout session
  const handlePurchaseReading = async () => {
    try {
      setPurchasingReading(true);
      setCheckoutError(null);

      const baseUrl = window.location.origin;
      const session = await userApi.createCheckoutSession(userId, {
        sessionType: 'one-time',
        priceId: STRIPE_CONFIG.readingPriceId,
        successUrl: STRIPE_CONFIG.getSuccessUrl(baseUrl),
        cancelUrl: STRIPE_CONFIG.getCancelUrl(baseUrl),
        metadata: {
          userId,
          readingType: STRIPE_CONFIG.readingTypes.SOUL_BLUEPRINT,
        },
      });

      // Redirect to Stripe checkout
      if (session.url) {
        window.location.href = session.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to start checkout. Please try again.';
      setCheckoutError(errorMessage);
      toast({
        title: 'Checkout Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setPurchasingReading(false);
    }
  };

  // Download reading as PDF
  const handleDownloadPDF = async () => {
    if (!selectedReading || !selectedReading.content) {
      toast({
        title: 'Download Failed',
        description: 'No reading content available to download.',
        variant: 'destructive',
      });
      return;
    }

    // Check browser support
    if (!isPDFGenerationSupported()) {
      toast({
        title: 'Not Supported',
        description: 'PDF download is not supported in your browser.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setDownloadingPDF(true);
      setPdfProgress(0);

      // Fetch user profile for birth name
      const userProfile = await userApi.getUserProfile(userId);

      if (!userProfile || !userProfile.profile?.birthName) {
        toast({
          title: 'Profile Incomplete',
          description: 'Please complete your profile before downloading readings.',
          variant: 'destructive',
        });
        return;
      }

      // Generate PDF
      const result = await generateReadingPDF({
        birthName: userProfile.profile.birthName,
        readingType: selectedReading.type,
        content: selectedReading.content,
        createdAt: selectedReading.createdAt,
        onProgress: setPdfProgress,
      });

      if (result.success) {
        toast({
          title: 'Download Complete',
          description: `Your reading has been saved as ${result.filename}`,
        });
      } else {
        throw new Error(result.error || 'Failed to generate PDF');
      }
    } catch (error) {
      console.error('Failed to download PDF:', error);
      toast({
        title: 'Download Failed',
        description:
          error instanceof Error ? error.message : 'Failed to generate PDF. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingPDF(false);
      setPdfProgress(0);
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
        <div className="mb-4 flex items-center justify-between">
          <Button
            onClick={() => setSelectedReading(null)}
            variant="outline"
            className="bg-transparent border-white/20 text-white hover:bg-white/10"
          >
            ← Back to Readings
          </Button>
          {selectedReading.status === 'Ready' && selectedReading.content && (
            <Button
              onClick={handleDownloadPDF}
              disabled={downloadingPDF}
              variant="default"
              className="flex items-center gap-2 bg-gradient-to-r from-[#ff8a65] to-[#ffb74d] text-[#1a1b3a] hover:opacity-90"
              aria-label="Download reading as PDF"
            >
              {downloadingPDF ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Downloading {pdfProgress > 0 && `${pdfProgress}%`}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download PDF
                </>
              )}
            </Button>
          )}
        </div>

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
              <p>
                We&apos;re sorry, but we couldn&apos;t generate your reading at this time. Please
                try again later.
              </p>
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
        {hasNatalChart && (
          <Button
            onClick={handlePurchaseReading}
            disabled={purchasingReading || !hasNatalChart}
            variant="default"
            className="flex items-center gap-2 bg-gradient-to-r from-[#ff8a65] to-[#ffb74d] text-[#1a1b3a] hover:opacity-90"
          >
            {purchasingReading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating checkout session...
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" />
                Purchase Reading
              </>
            )}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20">
          <p>{error}</p>
        </div>
      )}

      {checkoutError && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-600 dark:bg-red-900/20">
          <p>{checkoutError}</p>
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
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-8 dark:from-purple-900/20 dark:to-blue-900/20">
            <div className="mx-auto max-w-2xl text-center">
              <BookOpen className="mx-auto h-12 w-12 text-purple-600 dark:text-purple-400" />
              <h4 className="mt-4 text-2xl font-bold">Unlock Your Soul Blueprint</h4>

              {/* Product Description */}
              <p className="mt-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                {STRIPE_CONFIG.productDescription}
              </p>

              {/* Pricing Section */}
              <div className="mt-8 inline-flex flex-col items-center rounded-lg bg-white/80 dark:bg-gray-900/80 backdrop-blur p-6 shadow-lg">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-purple-600 dark:text-purple-400">
                    {STRIPE_CONFIG.displayPrice}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {STRIPE_CONFIG.paymentType}
                  </span>
                </div>

                {/* Benefits List */}
                <ul className="mt-4 space-y-2 text-left text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    <span>Personalized to your exact birth chart</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    <span>AI-powered deep astrological analysis</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400">✓</span>
                    <span>Instant PDF download available</span>
                  </li>
                </ul>
              </div>

              {/* Purchase Button */}
              {hasNatalChart ? (
                <Button
                  onClick={handlePurchaseReading}
                  disabled={purchasingReading || !hasNatalChart}
                  size="lg"
                  className="mt-8 bg-gradient-to-r from-[#ff8a65] to-[#ffb74d] hover:opacity-90 text-[#1a1b3a] px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  {purchasingReading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Creating checkout session...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Purchase Soul Blueprint Reading
                    </>
                  )}
                </Button>
              ) : (
                <div className="mt-8 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Please complete your profile and generate your natal chart before purchasing a
                    reading.
                  </p>
                </div>
              )}
            </div>
          </div>
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
