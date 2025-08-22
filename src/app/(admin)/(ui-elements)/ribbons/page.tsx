import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import RibbonExample from "@/components/ui/ribbons";

import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "",
  description:
    "",
};

export default function Ribbons() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Ribbons" />
      <RibbonExample />
    </div>
  );
}
