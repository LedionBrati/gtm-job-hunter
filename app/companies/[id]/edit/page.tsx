import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCompany, type FormState } from "@/app/actions";
import { CompanyForm } from "@/components/company-form";
import { getCompany } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany(id);
  return { title: company ? `Edit ${company.name} — Targets` : "Not found" };
}

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  // Bind the id server-side so the client form never supplies which row to
  // write — it only ever submits field values.
  async function action(prev: FormState, formData: FormData) {
    "use server";
    return updateCompany(id, prev, formData);
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 pt-10">
      <Link
        href={`/company/${company.id}`}
        className="label-muted underline-grow no-underline"
      >
        ← Back to {company.name}
      </Link>
      <span className="label mt-8 block">Edit</span>
      <h1 className="headline mt-5">{company.name}</h1>
      <CompanyForm
        action={action}
        defaults={company}
        submitLabel="Save changes"
        cancelHref={`/company/${company.id}`}
      />
    </div>
  );
}
