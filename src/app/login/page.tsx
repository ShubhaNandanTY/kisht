import { getLang } from "@/server/auth";
import { LangProvider } from "@/i18n/client";
import { DEMO_PASSWORD, MANAGERS, OFFICERS } from "@/server/demo/reference";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const lang = await getLang("en");
  const demo =
    process.env.DEMO_MODE === "true"
      ? {
          password: process.env.SEED_PASSWORD ? null : DEMO_PASSWORD,
          accounts: [
            { email: OFFICERS[0].email, name: OFFICERS[0].name, role: "officer", note: "Sanwer Road", hint: "Company B · promise pending" },
            { email: OFFICERS[8].email, name: OFFICERS[8].name, role: "officer", note: "Pithampur", hint: "Company C · 4 days from rolling" },
            { email: OFFICERS[4].email, name: OFFICERS[4].name, role: "officer", note: "Siyaganj", hint: "Company D · broken promise" },
            { email: MANAGERS[1].email, name: MANAGERS[1].name, role: "manager", note: "Sanwer Road", hint: "One branch, team lists, overrides" },
            { email: MANAGERS[3].email, name: MANAGERS[3].name, role: "head", note: "All branches", hint: "Roll rates, model, import, reset" },
          ],
        }
      : null;
  return (
    <LangProvider initial={lang}>
      <LoginForm demo={demo} />
    </LangProvider>
  );
}
