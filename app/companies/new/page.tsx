import Link from "next/link";
import { createCompany } from "@/app/actions";
import { CompanyForm } from "@/components/company-form";

export const metadata = { title: "Add company — Targets" };

export default function NewCompanyPage() {
  return (
    <div className="mx-auto max-w-[1240px] px-6 pt-10">
      <Link href="/" className="label-muted underline-grow no-underline">
        ← Back to list
      </Link>
      <span className="label mt-8 block">Add</span>
      <h1 className="headline mt-5">
        A company the
        <br />
        importer <span className="ac">missed</span>.
      </h1>
      <CompanyForm
        action={createCompany}
        submitLabel="Add company"
        cancelHref="/"
      />
    </div>
  );
}
