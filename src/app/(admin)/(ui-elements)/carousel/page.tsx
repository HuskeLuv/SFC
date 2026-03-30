import dynamic from 'next/dynamic';
import ComponentCard from '@/components/common/ComponentCard';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { Metadata } from 'next';
import React from 'react';

const carouselLoading = () => (
  <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-72" />
);

const SlideOnly = dynamic(() => import('@/components/ui/carousel/SlideOnly'), {
  ssr: false,
  loading: carouselLoading,
});

const WithControl = dynamic(() => import('@/components/ui/carousel/WithControl'), {
  ssr: false,
  loading: carouselLoading,
});

const WithIndicators = dynamic(() => import('@/components/ui/carousel/WithIndicators'), {
  ssr: false,
  loading: carouselLoading,
});

const WithControlAndIndicators = dynamic(
  () => import('@/components/ui/carousel/WithControlAndIndicators'),
  {
    ssr: false,
    loading: carouselLoading,
  },
);

export const metadata: Metadata = {
  title: '',
  description: '',
  // other metadata
};

export default function Carousel() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Carousel" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:gap-6">
        <ComponentCard title="Slides Only">
          <SlideOnly />
        </ComponentCard>
        <ComponentCard title="With controls">
          <WithControl />
        </ComponentCard>
        <ComponentCard title="With indicators">
          <WithIndicators />
        </ComponentCard>
        <ComponentCard title="    With controls and indicators">
          <WithControlAndIndicators />
        </ComponentCard>
      </div>
    </div>
  );
}
