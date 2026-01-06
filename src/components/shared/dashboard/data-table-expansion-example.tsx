/**
 * Example component demonstrating the DataTable row expansion feature
 * This can be used for testing and as a reference for implementation
 */

import { DataTable } from "./data-table";
import type { FieldOption } from "./dashboard-model";

export function DataTableExpansionExample() {
  // Sample data with multiple fields
  const data = [
    {
      id: 1,
      name: "Alice Johnson",
      email: "alice.johnson@example.com",
      age: 28,
      city: "New York",
      country: "USA",
      department: "Engineering",
      salary: 95000,
      joinDate: "2020-03-15",
      status: "Active",
    },
    {
      id: 2,
      name: "Bob Smith",
      email: "bob.smith@example.com",
      age: 35,
      city: "London",
      country: "UK",
      department: "Marketing",
      salary: 78000,
      joinDate: "2019-07-22",
      status: "Active",
    },
    {
      id: 3,
      name: "Carol Williams",
      email: "carol.williams@example.com",
      age: 42,
      city: "Tokyo",
      country: "Japan",
      department: "Sales",
      salary: 102000,
      joinDate: "2018-01-10",
      status: "Active",
    },
    {
      id: 4,
      name: "David Brown",
      email: "david.brown@example.com",
      age: 31,
      city: "Berlin",
      country: "Germany",
      department: "Engineering",
      salary: 88000,
      joinDate: "2021-05-18",
      status: "On Leave",
    },
    {
      id: 5,
      name: "Emma Davis",
      email: "emma.davis@example.com",
      age: 26,
      city: "Sydney",
      country: "Australia",
      department: "Design",
      salary: 72000,
      joinDate: "2022-09-03",
      status: "Active",
    },
  ];

  // Metadata describing the columns
  const meta = [
    { name: "id", type: "UInt32" },
    { name: "name", type: "String" },
    { name: "email", type: "String" },
    { name: "age", type: "UInt8" },
    { name: "city", type: "String" },
    { name: "country", type: "String" },
    { name: "department", type: "String" },
    { name: "salary", type: "Float64" },
    { name: "joinDate", type: "Date" },
    { name: "status", type: "String" },
  ];

  // Field options for formatting and display
  const fieldOptions: FieldOption[] = [
    {
      name: "id",
      title: "ID",
      align: "center",
      width: "60px",
    },
    {
      name: "name",
      title: "Full Name",
      width: "180px",
    },
    {
      name: "email",
      title: "Email Address",
      width: "220px",
    },
    {
      name: "age",
      title: "Age",
      align: "right",
      width: "60px",
    },
    {
      name: "city",
      title: "City",
      width: "120px",
    },
    {
      name: "country",
      title: "Country",
      width: "120px",
    },
    {
      name: "department",
      title: "Department",
      width: "140px",
    },
    {
      name: "salary",
      title: "Salary",
      align: "right",
      format: "comma_number",
      width: "120px",
    },
    {
      name: "joinDate",
      title: "Join Date",
      align: "center",
      width: "120px",
    },
    {
      name: "status",
      title: "Status",
      align: "center",
      width: "100px",
      format: (value: unknown) => {
        const status = String(value);
        const colorClass =
          status === "Active"
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
            : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300";
        return (
          <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${colorClass}`}>
            {status}
          </span>
        );
      },
    },
  ];

  return (
    <div className="w-full h-[600px] p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">DataTable Row Expansion Example</h2>
        <p className="text-muted-foreground">
          Click the chevron icon in the first column to expand/collapse row details.
          The expanded view shows all fields in a transposed format for easier reading.
        </p>
      </div>
      
      <DataTable
        data={data}
        meta={meta}
        fieldOptions={fieldOptions}
        enableShowRowDetail={true}
        enableIndexColumn={true}
        stickyHeader={true}
        defaultSort={{ column: "name", direction: "asc" }}
        className="border rounded-lg"
      />
    </div>
  );
}

