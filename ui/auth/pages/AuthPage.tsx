import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Icons } from "@/components/Icons";
import { authApi } from "@/lib/api/auth";
import bb8Icon from "@/assets/bb8.png";

type AuthStep = "initial" | "login" | "signup";

export function AuthPage() {
  const [step, setStep] = useState<AuthStep>("initial");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const logout = url.searchParams.get("logout");
    if (logout) {
      clearSession();
      url.searchParams.delete("logout");
      window.history.replaceState({}, "", url.toString());
      return;
    }
    let accessToken = readStoredToken();
    if (!accessToken) {
      accessToken = readAuthCookie();
    }
    if (accessToken && isJwtActive(accessToken)) {
      // Exchange JWT for Gateway token
      authApi
        .exchangeForGatewayToken(accessToken)
        .then((gatewayTokenResponse) => {
          const controlUiBase = import.meta.env.VITE_CONTROL_UI_BASE || "/";
          const trimmedBase = controlUiBase.endsWith("/")
            ? controlUiBase.slice(0, -1)
            : controlUiBase;
          window.location.assign(`${trimmedBase}/chat?token=${gatewayTokenResponse.gatewayToken}`);
        })
        .catch((err) => {
          console.error("Failed to exchange JWT for Gateway token:", err);
          // If exchange fails, clear session and stay on auth page
          clearSession();
        });
    }
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { exists } = await authApi.checkUser(email);

      if (exists) {
        setStep("login");
      } else {
        setStep("signup");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to process. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result =
        step === "login"
          ? await authApi.login(email, password)
          : await authApi.register({ email, password });

      // Save tokens and user info to localStorage
      localStorage.setItem("cb.auth.tokens", JSON.stringify(result.tokens));
      localStorage.setItem("cb.auth.user", JSON.stringify(result.user));
      localStorage.setItem("cb.auth.tenant", JSON.stringify(result.tenant));

      localStorage.setItem("accessToken", result.tokens.accessToken);
      localStorage.setItem("refreshToken", result.tokens.refreshToken);

      // Exchange JWT for Gateway token
      const gatewayTokenResponse = await authApi.exchangeForGatewayToken(
        result.tokens.accessToken,
      );

      // Redirect to Control UI with gateway token
      const controlUiBase = import.meta.env.VITE_CONTROL_UI_BASE || "/";
      const trimmedBase = controlUiBase.endsWith("/") ? controlUiBase.slice(0, -1) : controlUiBase;
      window.location.assign(`${trimmedBase}/chat?token=${gatewayTokenResponse.gatewayToken}`);
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          (step === "login"
            ? "Invalid password. Please try again."
            : "Failed to create account. Please try again."),
      );
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: "google" | "apple") => {
    setIsLoading(true);
    setError(null);

    try {
      if (provider === "google") {
        // const { url } = await authApi.getGoogleAuthUrl();
        // window.location.href = url;
        console.log("Google OAuth");
      } else if (provider === "apple") {
        // const { url } = await authApi.getAppleAuthUrl();
        // window.location.href = url;
        console.log("Apple OAuth");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to initialize OAuth. Please try again.");
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep("initial");
    setPassword("");
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo and Heading */}
        <div className="flex flex-col items-center mb-8 md:mb-12">
          <div className="w-16 h-16 md:w-20 md:h-20 mb-4 md:mb-6 flex items-center justify-center">
            <img src={bb8Icon} alt="BB-8" className="w-full h-full object-contain" />
          </div>

          {step === "initial" && (
            <>
              <h1
                className="text-4xl md:text-5xl font-normal tracking-tight text-foreground text-center mb-3 md:mb-4"
                style={{ fontFamily: "serif" }}
              >
                Impossible?
                <br />
                Possible.
              </h1>
              <p className="text-foreground/80 text-center text-sm md:text-base">
                The AI for problem solvers
              </p>
            </>
          )}

          {step === "login" && (
            <h1 className="text-2xl md:text-3xl font-normal tracking-tight text-foreground text-center">
              Enter your password
            </h1>
          )}

          {step === "signup" && (
            <>
              <h1 className="text-2xl md:text-3xl font-normal tracking-tight text-foreground text-center mb-2">
                Create a password
              </h1>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                You'll use this password to log in to bb3 and other products
              </p>
            </>
          )}
        </div>

        {/* Auth Card */}
        <div className="bg-card rounded-2xl border border-border p-6 md:p-8 shadow-2xl">
          <div className="space-y-4">
            {/* Initial Step - Email + OAuth */}
            {step === "initial" && (
              <>
                {/* OAuth Button */}
                <Button
                  variant="outline"
                  className="w-full h-12 text-base bg-transparent border-border hover:bg-secondary/50 transition-colors"
                  onClick={() => handleOAuthLogin("google")}
                  disabled={isLoading}
                >
                  <Icons.google className="mr-3 h-5 w-5" />
                  Continue with Google
                </Button>

                {/* Divider */}
                <div className="flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">OR</p>
                </div>

                {/* Error Alert */}
                {error && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/50">
                    <Icons.alertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Email Form */}
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                    className="h-12 bg-background border-border text-base text-foreground placeholder:text-muted-foreground"
                  />

                  <Button
                    type="submit"
                    className="w-full h-12 text-base bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                        Continue with email...
                      </>
                    ) : (
                      "Continue with email"
                    )}
                  </Button>
                </form>

                {/* Privacy Notice */}
                <p className="text-xs text-center text-muted-foreground pt-2">
                  By continuing, you acknowledge bb3's{" "}
                  <a href="/privacy" className="underline hover:text-foreground transition-colors">
                    Privacy Policy
                  </a>
                  .
                </p>
              </>
            )}

            {/* Login/Signup Step - Password */}
            {(step === "login" || step === "signup") && (
              <>
                {/* Email Display */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Email</label>
                  <div className="h-12 bg-background border border-border rounded-lg px-4 flex items-center justify-between text-foreground">
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={handleBack}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Change email"
                    >
                      <Icons.penSquare className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Error Alert */}
                {error && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/50">
                    <Icons.alertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Password Form */}
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    required
                    minLength={step === "signup" ? 8 : undefined}
                    className="h-12 bg-background border-border text-base text-foreground placeholder:text-muted-foreground"
                    autoFocus
                  />

                  {step === "login" && (
                    <div className="flex justify-end">
                      <a
                        href="/forgot-password"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Forgot password?
                      </a>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 text-base bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                        {step === "login" ? "Logging in..." : "Creating account..."}
                      </>
                    ) : (
                      "Continue"
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Footer Links */}
        {step === "initial" && (
          <div className="mt-6 text-center space-y-2">
            <div className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button
                onClick={() => setStep("signup")}
                className="text-foreground hover:underline transition-colors"
              >
                Sign up
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              Already have self-hosted setup?{" "}
              <a
                href="/import-config"
                className="text-foreground hover:underline transition-colors"
              >
                Import your settings
              </a>
            </div>
          </div>
        )}

        {(step === "login" || step === "signup") && (
          <div className="mt-6 text-center space-y-3">
            <div className="text-sm text-muted-foreground">
              {step === "login" ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => setStep(step === "login" ? "signup" : "login")}
                className="text-foreground hover:underline transition-colors"
              >
                {step === "login" ? "Sign up" : "Log in"}
              </button>
            </div>

            <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <a href="/terms" className="hover:text-foreground transition-colors">
                Terms of Use
              </a>
              <span>•</span>
              <a href="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function clearSession() {
  localStorage.removeItem("cb.auth.tokens");
  localStorage.removeItem("cb.auth.user");
  localStorage.removeItem("cb.auth.tenant");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  document.cookie = "cb_auth_token=; Path=/; Max-Age=0; SameSite=Lax";
}

function readStoredToken(): string {
  const raw = localStorage.getItem("cb.auth.tokens");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { accessToken?: string };
      if (typeof parsed.accessToken === "string") return parsed.accessToken;
    } catch {
      // ignore malformed storage
    }
  }
  return localStorage.getItem("accessToken") || "";
}

function readAuthCookie(): string {
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const entry of cookies) {
    const [key, ...rest] = entry.trim().split("=");
    if (key === "cb_auth_token") {
      return decodeURIComponent(rest.join("="));
    }
  }
  return "";
}

function setAuthCookie(token: string) {
  document.cookie = ["cb_auth_token=" + encodeURIComponent(token), "Path=/", "SameSite=Lax"].join(
    "; ",
  );
}

function isJwtActive(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  if (!exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return now < exp - 30;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1];
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  try {
    const json = atob(padded);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
