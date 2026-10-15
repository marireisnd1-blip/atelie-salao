"use client";
import { useState } from "react";
import { browserDb } from "@/lib/supabase/browser";
export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(e.currentTarget);
        try {
          const { error } = await browserDb().auth.signInWithPassword({
            email: String(form.get("email")),
            password: String(form.get("password")),
          });
          if (error) {
            setError("Não foi possível entrar. Confira seu e-mail e senha.");
            setBusy(false);
          } else window.location.assign("/");
        } catch {
          setError("Conexão indisponível. Tente novamente.");
          setBusy(false);
        }
      }}
    >
      <label>
        E-mail
        <input type="email" name="email" autoComplete="username" required />
      </label>
      <label>
        Senha
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Entrando…" : "Entrar no salão"}
      </button>
      <p className="muted small">
        O acesso é individual e criado pela administradora do salão.
      </p>
    </form>
  );
}
