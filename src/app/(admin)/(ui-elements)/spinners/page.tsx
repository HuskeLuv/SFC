import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import React from "react";

import SpinnerTwo from "./SpinnerTwo";
import SpinnerThree from "./SpinnerThree";
import SpinnerFour from "./SpinnerFour";
import { Metadata } from "next";
import SpinnerOne from "./SpinnerOne";

export const metadata: Metadata = {
  title: "",
  description:
    "",
};

export default function Spinners() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Spinners" />
      <div className="space-y-5 sm:space-y-6">
        <ComponentCard title="Spinner 1">
          <SpinnerOne />
        </ComponentCard>{" "}
        <ComponentCard title="Spinner 2">
          <SpinnerTwo />
        </ComponentCard>{" "}
        <ComponentCard title="Spinner 3">
          <SpinnerThree />
        </ComponentCard>{" "}
        <ComponentCard title="Spinner 4">
          <SpinnerFour />
        </ComponentCard>
      </div>
    </div>
  );
}
