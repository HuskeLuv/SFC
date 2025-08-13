import CrmMetrics from "@/components/crm/CrmMetrics";
import CrmRecentOrderTable from "@/components/crm/CrmRecentOrderTable";
import CrmStatisticsChart from "@/components/crm/CrmStatisticsChart";
import EstimatedRevenue from "@/components/crm/EstimatedRevenue";
import SalePieChart from "@/components/crm/SalePieChart";
import UpcomingSchedule from "@/components/crm/UpcomingSchedule";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard CRM",
  description:
    "Esta é a página do Dashboard",
};

export default function Crm() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <CrmMetrics />
      </div>

      <div className="col-span-12 xl:col-span-8">
        <CrmStatisticsChart />
      </div>

      <div className="col-span-12 xl:col-span-4">
        <EstimatedRevenue />
      </div>

      <div className="col-span-12 xl:col-span-6">
        <SalePieChart />
      </div>

      <div className="col-span-12 xl:col-span-6">
        <UpcomingSchedule />
      </div>

      <div className="col-span-12">
        <CrmRecentOrderTable />
      </div>
    </div>
  );
}
