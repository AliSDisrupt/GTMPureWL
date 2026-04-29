"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLocalLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (!response.ok) {
        setError("Incorrect username or password.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const oauthError = searchParams.get("error");

  return (
    <main className="loginRoot">
      <section className="loginCard">
        <div className="loginSticky">PureWL GTM</div>
        <div className="loginLogoBadge">PureWL GTM</div>
        <div className="loginLogoSub">Sign in to your dashboard</div>
        {error ? <div className="loginError">{error}</div> : null}
        {!error && oauthError ? (
          <div className="loginError">
            {oauthError === "domain_not_allowed"
              ? "Google sign-in allowed only for purevpn.com, purewl.com, or disrupt.com."
              : "Google sign-in failed. Please try again."}
          </div>
        ) : null}

        <div>
          <button
            className="loginBtnGhost"
            type="button"
            disabled={loading}
            onClick={() => {
              window.location.href = "/api/auth/google";
            }}
          >
            <img
              className="googleIcon"
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/3840px-Google_%22G%22_logo.svg.png"
              alt="Google"
            />
            Continue with Google
          </button>
        </div>

        <div className="loginDivider">or sign in locally</div>

        <form onSubmit={handleLocalLogin}>
          <label className="loginLabel">Username</label>
          <input
            className="loginInput"
            type="text"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label className="loginLabel">Password</label>
          <input
            className="loginInput"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="loginBtnPrimary" type="submit" disabled={loading}>
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="loginRoot"><section className="loginCard">Loading...</section></main>}>
      <LoginContent />
    </Suspense>
  );
}
