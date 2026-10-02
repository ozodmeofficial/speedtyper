"use client";

import { useState } from "react";
import { useT } from "@/components/providers/I18nProvider";
import { api } from "@/lib/client/api";
import type { DictKey } from "@/lib/i18n";
import { CrownIcon, LockIcon, TrophyIcon, UserIcon } from "@/components/ui/icons";
import { LevelBadge } from "@/components/xp/Badges";

type Err = { key: DictKey; vars?: Record<string, string | number> } | null;

const ERR_KEYS: Record<string, DictKey> = {
  invalid: "auth.err.invalid",
  taken: "auth.err.taken",
  emailTaken: "auth.err.emailTaken",
  username: "auth.err.username",
  password: "auth.err.password",
  email: "auth.err.email",
  rate: "auth.err.rate",
  csrf: "auth.err.csrf",
};

function toErr(status: number, data: { error?: string; retryAfter?: number }): Err {
  const key = (data.error && ERR_KEYS[data.error]) || (status === 403 ? "auth.err.csrf" : "auth.err.generic");
  return { key, vars: { s: data.retryAfter ?? 60 } };
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const { label, hint, ...rest } = props;
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input {...rest} placeholder={label} className="input" />
      {hint ? <span className="mt-1 block text-xs text-sub">{hint}</span> : null}
    </label>
  );
}

export function AuthForms() {
  const t = useT();
  const [regErr, setRegErr] = useState<Err>(null);
  const [logErr, setLogErr] = useState<Err>(null);
  const [busy, setBusy] = useState<"reg" | "log" | null>(null);

  const done = () => {
    window.location.assign("/");
  };

  const onRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = String(f.get("username") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const repeat = String(f.get("repeat") ?? "");
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return setRegErr({ key: "auth.err.username" });
    if (password.length < 8) return setRegErr({ key: "auth.err.password" });
    if (password !== repeat) return setRegErr({ key: "auth.err.mismatch" });
    setBusy("reg");
    setRegErr(null);
    const res = await api<{ error?: string; retryAfter?: number }>("/api/auth/register", { body: { username, email, password } });
    setBusy(null);
    if (res.ok) done();
    else setRegErr(toErr(res.status, res.data));
  };

  const onLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy("log");
    setLogErr(null);
    const res = await api<{ error?: string; retryAfter?: number }>("/api/auth/login", {
      body: { username: String(f.get("username") ?? ""), password: String(f.get("password") ?? "") },
    });
    setBusy(null);
    if (res.ok) done();
    else setLogErr(toErr(res.status, res.data));
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl flex-1 content-center items-start gap-6 py-12 md:grid-cols-2 md:gap-8">
      <form onSubmit={onRegister} className="card fade-in flex flex-col gap-3 p-6 sm:p-8" noValidate>
        <h1 className="mb-2 flex items-center gap-3 text-lg font-semibold text-text">
          <span className="tile !h-9 !w-9 !rounded-xl">
            <UserIcon size={16} />
          </span>
          <span className="first-letter:uppercase">{t("auth.registerTitle")}</span>
        </h1>
        <Field name="username" label={t("auth.username")} hint={t("auth.usernameHint")} autoComplete="username" maxLength={20} required />
        <Field name="email" type="email" label={t("auth.email")} autoComplete="email" maxLength={254} />
        <Field name="password" type="password" label={t("auth.password")} hint={t("auth.passwordHint")} autoComplete="new-password" maxLength={128} required />
        <Field name="repeat" type="password" label={t("auth.passwordRepeat")} autoComplete="new-password" maxLength={128} required />
        <p role="alert" className="min-h-5 text-sm text-error">
          {regErr ? t(regErr.key, regErr.vars) : ""}
        </p>
        <button type="submit" className="btn btn-primary w-full" disabled={busy !== null}>
          {busy === "reg" ? <Spinner /> : null}
          {t("auth.submitRegister")}
        </button>
        <div className="mt-3 border-t border-line pt-4">
          <p className="mb-2.5 text-xs text-sub">{t("auth.perksTitle")}</p>
          <ul className="flex flex-col gap-2 text-sm text-text">
            <li className="flex items-center gap-2.5">
              <LevelBadge level={7} size="xs" />
              {t("auth.perkXp")}
            </li>
            <li className="flex items-center gap-2.5">
              <span className="grid w-[1.15rem] place-items-center text-main">
                <CrownIcon size={14} />
              </span>
              {t("auth.perkPb")}
            </li>
            <li className="flex items-center gap-2.5">
              <span className="grid w-[1.15rem] place-items-center text-main">
                <TrophyIcon size={14} />
              </span>
              {t("auth.perkLb")}
            </li>
          </ul>
        </div>
      </form>

      <form onSubmit={onLogin} className="card fade-in flex flex-col gap-3 p-6 sm:p-8" noValidate>
        <h2 className="mb-2 flex items-center gap-3 text-lg font-semibold text-text">
          <span className="tile !h-9 !w-9 !rounded-xl">
            <LockIcon size={16} />
          </span>
          <span className="first-letter:uppercase">{t("auth.loginTitle")}</span>
        </h2>
        <Field name="username" label={t("auth.username")} autoComplete="username" maxLength={254} required />
        <Field name="password" type="password" label={t("auth.password")} autoComplete="current-password" maxLength={128} required />
        <p role="alert" className="min-h-5 text-sm text-error">
          {logErr ? t(logErr.key, logErr.vars) : ""}
        </p>
        <button type="submit" className="btn btn-primary w-full" disabled={busy !== null}>
          {busy === "log" ? <Spinner /> : null}
          {t("auth.submitLogin")}
        </button>
        <p className="mt-1 text-xs leading-relaxed text-sub">{t("auth.why")}</p>
      </form>
    </div>
  );
}

function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;
}
