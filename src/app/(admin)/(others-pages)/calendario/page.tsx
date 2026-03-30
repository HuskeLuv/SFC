import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Calendar from '@/components/calendar/Calendar';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '',
  description: '',
};

export default function Page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Calendário" />
      <Calendar />
    </div>
  );
}
