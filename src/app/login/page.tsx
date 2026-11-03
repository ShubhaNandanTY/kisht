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
            { email: OFFICERS[0].email, name: OFFICERS[0].name, role: "officer", note: "Sanwer Road" },
            { email: OFFICERS[8].email, name: OFFICERS[8].name, role: "officer", note: "Pithampur" },
            { email: MANAGERS[1].email, name: MANAGERS[1].name, role: "manager", note: "Sanwer Road" },
            { email: MANAGERS[3].email, name: MANAGERS[3].name, role: "head", note: "All branches" },
          ],
        }
      : null;
  return (
    <LangProvider initial={lang}>
      <LoginForm demo={demo} />
    </LangProvider>
  );
}
