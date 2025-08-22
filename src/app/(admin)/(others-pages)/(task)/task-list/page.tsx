import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import React from "react";
import { Metadata } from "next";
import TaskList from "@/components/task/task-list/TaskList";

export const metadata: Metadata = {
  title: "",
  description:
    "Lista de Tarefas",
  // other metadata
};

export default function TaskListPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Task List" />
      <TaskList />
    </div>
  );
}
