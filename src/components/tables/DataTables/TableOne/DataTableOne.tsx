"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../../../ui/table";
import { AngleDownIcon, AngleUpIcon } from "@/icons";
import Image from "next/image";
import PaginationWithIcon from "./PaginationWithIcon";

const tableRowData = [
  {
    id: 1,
    user: {
      image: "/images/user/user-20.jpg",
      name: "Abram Schleifer",
    },
    position: "Sales Assistant",
    location: "Edinburgh",
    age: 57,
    date: "25 Apr, 2027",
    salary: "$89,500",
  },
  {
    id: 2,
    user: {
      image: "/images/user/user-21.jpg",
      name: "Charlotte Anderson",
    },
    position: "Marketing Manager",
    location: "London",
    age: 42,
    date: "12 Mar, 2025",
    salary: "$105,000",
  },
  {
    id: 3,
    user: {
      image: "/images/user/user-22.jpg",
      name: "Ethan Brown",
    },
    position: "Software Engineer",
    location: "San Francisco",
    age: 30,
    date: "01 Jan, 2024",
    salary: "$120,000",
  },
  {
    id: 4,
    user: {
      image: "/images/user/user-23.jpg",
      name: "Sophia Martinez",
    },
    position: "Product Manager",
    location: "New York",
    age: 35,
    date: "15 Jun, 2026",
    salary: "$95,000",
  },
  {
    id: 5,
    user: {
      image: "/images/user/user-24.jpg",
      name: "James Wilson",
    },
    position: "Data Analyst",
    location: "Chicago",
    age: 28,
    date: "20 Sep, 2025",
    salary: "$80,000",
  },
  {
    id: 6,
    user: {
      image: "/images/user/user-25.jpg",
      name: "Olivia Johnson",
    },
    position: "HR Specialist",
    location: "Los Angeles",
    age: 40,
    date: "08 Nov, 2026",
    salary: "$75,000",
  },
  {
    id: 7,
    user: {
      image: "/images/user/user-26.jpg",
      name: "William Smith",
    },
    position: "Financial Analyst",
    location: "Seattle",
    age: 38,
    date: "03 Feb, 2026",
    salary: "$88,000",
  },
  {
    id: 8,
    user: {
      image: "/images/user/user-27.jpg",
      name: "Isabella Davis",
    },
    position: "UI/UX Designer",
    location: "Austin",
    age: 29,
    date: "18 Jul, 2025",
    salary: "$92,000",
  },
  {
    id: 9,
    user: {
      image: "/images/user/user-28.jpg",
      name: "Liam Moore",
    },
    position: "DevOps Engineer",
    location: "Boston",
    age: 33,
    date: "30 Oct, 2024",
    salary: "$115,000",
  },
  {
    id: 10,
    user: {
      image: "/images/user/user-29.jpg",
      name: "Mia Garcia",
    },
    position: "Content Strategist",
    location: "Denver",
    age: 27,
    date: "12 Dec, 2027",
    salary: "$70,000",
  },
];

type SortKey = "name" | "position" | "location" | "age" | "date" | "salary";
type SortOrder = "asc" | "desc";

export default function DataTableOne() { return null; }
