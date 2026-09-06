"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import type { LoginResponse } from "@/lib/types";
import { useT, useLocale } from "@/i18n";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { PanelLogo } from "@/components/PanelLogo";
import { PANEL_BRAND } from "@/lib/panel-brand";

export default function LoginPage() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const setAuth = useAuth((s) => s.setAuth);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        username,
        password,
      });
      setAuth(data.accessToken, data.refreshToken, data.admin);
      router.replace("/dashboard");
    } catch (err: unknown) {
      const msg =
        (typeof err === "object" &&
          err &&
          "response" in err &&
          // @ts-expect-error narrow axios error shape
          err.response?.data?.message) ||
        t("login.failed");
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="aurora-layer" aria-hidden />
      <div className="relative z-10 w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="neon-glow-violet mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-zinc-200/70 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]">
            <PanelLogo size={56} priority />
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-gradient-brand">
              {locale === "fa" ? PANEL_BRAND.nameFa : PANEL_BRAND.name}
            </span>
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {locale === "fa" ? PANEL_BRAND.descriptionFa : PANEL_BRAND.description}
          </p>
          <div className="mt-4">
            <LocaleSwitcher />
          </div>
        </div>

        <form onSubmit={onSubmit} className="glass-card space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-500 dark:text-zinc-400">{t("login.username")}</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("login.usernamePlaceholder")}
              className="w-full rounded-xl border border-zinc-300/80 bg-white px-3.5 py-2.5 text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-600"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-zinc-500 dark:text-zinc-400">{t("login.password")}</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                className="w-full rounded-xl border border-zinc-300/80 bg-white px-3.5 py-2.5 pe-10 text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-600"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                tabIndex={-1}
                aria-label={showPassword ? t("login.hidePassword") : t("login.showPassword")}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="neon-primary w-full rounded-xl py-2.5 font-semibold disabled:opacity-50"
          >
            {loading ? t("login.signingIn") : t("login.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
