import React from 'react';
import { Skeleton } from '../ui/Skeleton';

interface PageLoaderProps {
  lines?: number;
}

/**
 * Full-page loading skeleton shown while data loads.
 */
export const PageLoader: React.FC<PageLoaderProps> = ({ lines = 6 }) => (
  <div className="animate-pulse space-y-4" role="status" aria-label="Loading">
    <Skeleton className="h-8 w-64" variant="title" />
    <Skeleton className="h-5 w-96" variant="text" />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className="w-full"
        variant="card"
        style={{ height: `${Math.max(120, 240 - i * 30)}px` }}
      />
    ))}
    <span className="sr-only">Loading page content...</span>
  </div>
);
