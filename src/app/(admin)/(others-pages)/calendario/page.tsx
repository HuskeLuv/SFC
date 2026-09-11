import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Calendar from '@/components/calendar/Calendar';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agenda',
  description: 'Parcelas, proventos, vencimentos e seus eventos num só calendário.',
};

export default function Page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Agenda" />
      <Calendar />
    </div>
  );
}
