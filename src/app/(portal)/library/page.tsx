import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { addBook, issue, returnBook } from "./actions";

export const metadata: Metadata = { title: "Library" };
type Loan = { id: string; issued_on: string; due_on: string; returned_on: string | null; fine_amount: number; students: { full_name: string; enrollment_no: string }; library_copies: { accession_no: string; library_books: { title: string } } };

export default async function LibraryPage() {
  const profile = await requireRole();
  const isStaff = ["super_admin", "management", "principal", "office_staff"].includes(profile.role);
  const supabase = await createClient();
  const { data } = await supabase.from("library_loans").select("id, issued_on, due_on, returned_on, fine_amount, students(full_name, enrollment_no), library_copies(accession_no, library_books(title))")
    .order("issued_on", { ascending: false }).limit(isStaff ? 100 : 50);
  const loans = (data ?? []) as unknown as Loan[];
  const today = new Date().toISOString().slice(0, 10);
  return <div className="space-y-4">
    <h1 className="page-title mb-0">Library</h1>
    {isStaff && <div className="grid gap-4 md:grid-cols-2">
      <section className="card"><h2 className="section-title">Issue a book</h2><ActionForm action={issue} className="space-y-3">
        <div><label className="label" htmlFor="i_code">Barcode / accession no. (a USB or Bluetooth scanner can type this)</label><input id="i_code" name="code" required className="input" autoComplete="off" /></div>
        <div><label className="label" htmlFor="enrollment_no">Student enrollment no.</label><input id="enrollment_no" name="enrollment_no" required className="input" autoComplete="off" /></div>
        <Submit>Issue</Submit></ActionForm></section>
      <section className="card"><h2 className="section-title">Return a book</h2><ActionForm action={returnBook} className="space-y-3">
        <div><label className="label" htmlFor="r_code">Barcode / accession no.</label><input id="r_code" name="code" required className="input" autoComplete="off" /></div>
        <Submit>Return</Submit></ActionForm></section>
      <section className="card md:col-span-2"><h2 className="section-title">Add to the accession register</h2><ActionForm action={addBook} className="form-grid">
        <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required className="input" /></div>
        <div><label className="label" htmlFor="author">Author</label><input id="author" name="author" className="input" /></div>
        <div><label className="label" htmlFor="isbn">ISBN</label><input id="isbn" name="isbn" className="input" /></div>
        <div><label className="label" htmlFor="accession_no">Accession no.</label><input id="accession_no" name="accession_no" required className="input" /></div>
        <div><label className="label" htmlFor="barcode">Barcode</label><input id="barcode" name="barcode" className="input" /></div>
        <Submit className="btn btn-secondary">Add book</Submit></ActionForm></section>
    </div>}
    <section className="card overflow-x-auto"><h2 className="section-title">{isStaff ? "Recent loans" : "Borrowed books"}</h2><table className="data-table">
      <thead><tr><th>Book</th><th>Student</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>{loans.map((l) => {
        const overdue = !l.returned_on && l.due_on < today;
        return <tr key={l.id}><td>{l.library_copies.library_books.title}<br /><span className="text-xs text-[var(--ink-soft)]">{l.library_copies.accession_no}</span></td><td>{l.students.full_name}</td><td>{l.issued_on}</td><td>{l.due_on}</td>
          <td>{l.returned_on ? `Returned ${l.returned_on}${Number(l.fine_amount) > 0 ? `, fine ₹${l.fine_amount}` : ""}` : overdue ? <span className="font-semibold text-[var(--bad)]">Overdue</span> : "On loan"}</td></tr>;
      })}{!loans.length && <tr><td colSpan={5}>No loans to show.</td></tr>}</tbody></table></section>
  </div>;
}
