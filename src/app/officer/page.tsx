import { redirect } from "next/navigation";
import { LangProvider } from "@/i18n/client";
import { demoMode, getLang, getSession } from "@/server/auth";
import { OfficerApp } from "./OfficerApp";

export const dynamic = "force-dynamic";

export default async function OfficerPage() {
  const session = await getSession();
  if (!session || session.role !== "officer") redirect("/login");
  return (
    <LangProvider initial={await getLang("hi")}>
      <OfficerApp officerId={session.sub} demo={demoMode()} />
    </LangProvider>
  );
}
