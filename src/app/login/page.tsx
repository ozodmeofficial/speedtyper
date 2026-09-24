import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/server/context";
import { AuthForms } from "@/components/auth/AuthForms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestContext();
  return { title: t("auth.login"), robots: { index: false } };
}

export default async function LoginPage() {
  const { user } = await getRequestContext();
  if (user) redirect(`/u/${user.username}`);
  return <AuthForms />;
}
