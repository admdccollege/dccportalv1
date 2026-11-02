export const ROLES = ["super_admin", "management", "principal", "exam_cell", "faculty", "office_staff", "lab_technician", "parent", "student"] as const;
export type Role = (typeof ROLES)[number];
export const PORTALS = ["institutional", "staff", "parent", "student"] as const;
export type Portal = (typeof PORTALS)[number];
export const TIERS = ["higher_secondary", "undergraduate", "postgraduate"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = {
  higher_secondary: "Higher Secondary", undergraduate: "Undergraduate", postgraduate: "Postgraduate",
};
export const PORTAL_ROLES: Record<Portal, readonly Role[]> = {
  institutional: ["super_admin", "management", "principal", "exam_cell"],
  staff: ["faculty", "office_staff", "lab_technician"],
  parent: ["parent"],
  student: ["student"],
};
export const ADMIN: readonly Role[] = ["super_admin", "management", "principal"];
export const portalOf = (role: Role): Portal =>
  PORTALS.find((p) => PORTAL_ROLES[p].includes(role)) ?? "student";

export const LOGIN_COPY: Record<Portal, {
  tab: string; label: string; placeholder: string; helper: string; cta: string;
}> = {
  institutional: {
    tab: "Institutional", label: "Institutional ID / DCC Admin Email", placeholder: "admin@dcc.edu or DCC-ADM-001",
    helper: "For Super Admin, Management, Exam Cell and Principals.", cta: "Login as Institutional Admin",
  },
  staff: {
    tab: "Staffs", label: "Staff ID / Academic Email", placeholder: "DCC-FAC-102 or name@dcc.edu",
    helper: "For faculty, office staff and lab technicians.", cta: "Sign In as DCC Staff",
  },
  parent: {
    tab: "Parents", label: "Registered Mobile / Parent ID", placeholder: "10-digit mobile or Parent ID",
    helper: "Track your child's attendance, fees and progress.", cta: "Access Parent Portal",
  },
  student: {
    tab: "Students", label: "Enrollment / Roll Number", placeholder: "e.g. DCC-UG-2026-0147",
    helper: "For Higher Secondary, Undergraduate and Postgraduate students.", cta: "Student Login",
  },
};
