"use client";

import { signIn } from "next-auth/react";
import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(errorParam || "");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl });
  };

  return (
    <div className="login-container">
      {/* Header */}
      <div className="login-header">
        <div className="login-logo">
          <span className="login-logo__icon">&#9670;</span>
          <span className="login-logo__text">SGI</span>
        </div>
        <h1 className="login-title">Bem-vindo de volta</h1>
        <p className="login-subtitle">
          Entre na sua conta para acessar os dashboards
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="login-error">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.75a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7a.75.75 0 110-1.5.75.75 0 010 1.5z" />
          </svg>
          <span>{error === "CredentialsSignin" ? "Email ou senha incorretos" : error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="email" className="form-label">
            Email
          </label>
          <div className="form-input-wrapper">
            <svg className="form-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="form-input"
              required
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="password" className="form-label">
            Senha
          </label>
          <div className="form-input-wrapper">
            <svg className="form-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="form-input"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="form-input-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? (
            <span className="btn-loading">
              <span className="spinner"></span>
              Entrando...
            </span>
          ) : (
            "Entrar"
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="login-divider">
        <span>ou continue com</span>
      </div>

      {/* SSO Google */}
      <button
        type="button"
        className="btn btn-google"
        onClick={handleGoogleLogin}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Google
      </button>

      {/* Footer */}
      <div className="login-footer">
        <p>SGI v0.2.0 — iLinked</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="screen">
      <Suspense fallback={
        <div className="login-container" style={{ textAlign: "center", padding: "60px 32px" }}>
          <span className="spinner" style={{ width: 24, height: 24, borderColor: "rgba(77,159,255,0.3)", borderTopColor: "#4d9fff" }}></span>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </main>
  );
}
