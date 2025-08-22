import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import NotificationExample from "@/components/ui/notification/NotificationExample";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "",
  description:
    "",
};

export default function Notifications() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Notifications" />
      <NotificationExample />
    </div>
  );
}
