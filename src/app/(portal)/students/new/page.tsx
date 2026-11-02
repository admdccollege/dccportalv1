import { requireRole } from "@/lib/auth";
import { StudentForm } from "@/components/student-form";

export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  await requireRole(["super_admin", "management", "principal", "office_staff"]);
  return <><h1 className="page-title">Add student</h1><StudentForm /></>;
}
