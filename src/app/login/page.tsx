import { LoginForm } from "@/components/login-form";
import { isDemoMode } from "@/lib/config";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Login() {
  if (isDemoMode()) redirect("/");
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">a.</div>
        <p className="eyebrow">SEU SALÃO, EM HARMONIA</p>
        <h1>Bem-vinda de volta.</h1>
        <p>Entre para acompanhar a agenda e cuidar de cada atendimento.</p>
        <LoginForm />
      </section>
    </main>
  );
}
