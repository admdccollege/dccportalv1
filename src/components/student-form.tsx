"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/action-form";
import { Credentials } from "@/components/credentials";
import { createStudent, type Credential } from "@/app/(portal)/students/actions";
import { TIER_LABEL, TIERS, type Tier } from "@/lib/roles";

function Field({ name, label, required, type = "text", placeholder }: { name: string; label: string; required?: boolean; type?: string; placeholder?: string }) {
  return <div><label className="label" htmlFor={name}>{label}{required && " *"}</label>
    <input id={name} name={name} type={type} required={required} placeholder={placeholder} className="input" /></div>;
}
function Choice({ name, label, options, required }: { name: string; label: string; options: string[]; required?: boolean }) {
  return <div><label className="label" htmlFor={name}>{label}{required && " *"}</label>
    <select id={name} name={name} required={required} className="input">{options.map((o) => <option key={o}>{o}</option>)}</select></div>;
}

export function StudentForm() {
  const [tier, setTier] = useState<Tier>("higher_secondary");
  return (
    <ActionForm action={createStudent} className="space-y-4" render={(s) => s.data ? <Credentials items={s.data as Credential[]} /> : null}>
      <fieldset className="card">
        <legend className="section-title">Academic tier</legend>
        <div className="flex flex-wrap gap-2">
          {TIERS.map((t) => (
            <label key={t} className={`btn ${tier === t ? "btn-primary" : "btn-secondary"}`}>
              <input type="radio" name="tier" value={t} checked={tier === t} onChange={() => setTier(t)} className="sr-only" /> {TIER_LABEL[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="card"><legend className="section-title">Academic details</legend><div className="form-grid">
        <Field name="enrollment_no" label="Enrollment / Roll No" required />
        <Field name="program_code" label="Program code" placeholder="As in Academic setup" />
        {tier === "higher_secondary" && <>
          <Choice name="class_level" label="Class" options={["XI", "XII"]} required />
          <Choice name="stream" label="Stream" options={["Arts", "Science", "Commerce"]} required />
          <Field name="council_reg_no" label="Council Registration No" />
          <Field name="combination_subjects" label="Combination subjects" placeholder="Separate with commas" />
        </>}
        {tier === "undergraduate" && <>
          <Field name="degree" label="Degree" required placeholder="B.A., B.Sc." />
          <Field name="major_subject" label="Major subject" required />
          <Field name="minor_subject" label="Minor subject" />
          <Choice name="semester" label="Semester" options={["1", "2", "3", "4", "5", "6"]} required />
          <Field name="university_roll_no" label="University Roll No" />
          <Field name="university_reg_no" label="University Reg No" />
        </>}
        {tier === "postgraduate" && <>
          <Field name="department_code" label="Department code" required placeholder="As in Academic setup" />
          <Field name="specialization" label="Specialization" required />
          <Choice name="semester" label="Semester" options={["1", "2", "3", "4"]} required />
          <Field name="previous_degree" label="Previous degree" required />
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="previous_degree_verified" className="size-5" /> Previous degree verified</label>
        </>}
      </div></fieldset>
      <fieldset className="card"><legend className="section-title">Personal details</legend><div className="form-grid">
        <Field name="full_name" label="Full name" required />
        <Field name="date_of_birth" label="Date of birth" type="date" />
        <Field name="gender" label="Gender" />
        <Field name="phone" label="Mobile" type="tel" />
        <Field name="email" label="Email" type="email" />
        <Field name="address" label="Address" />
        <div><label className="label" htmlFor="residential_category">Residential category</label>
          <select id="residential_category" name="residential_category" className="input">
            <option value="day_scholar">Day scholar</option><option value="hostel">Hostel</option><option value="other">Other</option>
          </select></div>
      </div></fieldset>
      <fieldset className="card"><legend className="section-title">Guardian</legend><div className="form-grid">
        <Field name="guardian_name" label="Guardian name" required />
        <Field name="guardian_relation" label="Relation" placeholder="Father, Mother" />
        <Field name="guardian_phone" label="Guardian mobile" type="tel" required />
        <Field name="guardian_email" label="Guardian email" type="email" />
      </div></fieldset>
      <Submit>Add student and create logins</Submit>
    </ActionForm>
  );
}
