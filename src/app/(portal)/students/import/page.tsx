import { requireRole } from "@/lib/auth";
import { ImportForm } from "@/components/import-form";

export const metadata = { title: "Bulk upload" };

export default async function ImportPage() {
  await requireRole(["super_admin", "management", "principal", "office_staff"]);
  return (
    <>
      <h1 className="page-title">Bulk upload students</h1>
      <div className="card space-y-3">
        <p className="text-sm">Upload a .csv or .xlsx file of up to 2,000 students. The tier is read from the <code>tier</code> column (HS, UG or PG) or worked out from the fields filled in. Valid rows are added, and any problems are listed by row number so you can fix and re-upload just those rows.</p>
        <a className="btn btn-secondary" href="/templates/students-template.csv" download>Download template</a>
        <ImportForm />
      </div>
    </>
  );
}
