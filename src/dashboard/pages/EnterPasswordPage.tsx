import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Icons } from "@/components/Icons";
import { authApi } from "@/lib/api/auth";
import bb8Icon from "@/assets/bb8.png";

export function EnterPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || "";

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Call login API
      const response = await authApi.login(email, password);

      // Save tokens and user info to localStorage
      localStorage.setItem("cb.auth.tokens", JSON.stringify(response.tokens));
      localStorage.setItem("cb.auth.user", JSON.stringify(response.user));
      localStorage.setItem("cb.auth.tenant", JSON.stringify(response.tenant));

      // Redirect to Control UI with access token
      const controlUiBase = import.meta.env.VITE_CONTROL_UI_BASE || "/";
      window.location.assign(`${controlUiBase}/chat?token=${response.tokens.accessToken}`);
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid password. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 mb-6 flex items-center justify-center">
            <img src={bb8Icon} alt="BB-8" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-normal tracking-tight text-foreground text-center">
            Enter your password
          </h1>
        </div>

        {/* Form Card */}
        <div className="bg-card rounded-2xl border border-border p-8 shadow-2xl">
          <div className="space-y-4">
            {/* Email Display */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Email</label>
              <div className="h-12 bg-background border border-border rounded-lg px-4 flex items-center text-foreground">
                {email}
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                className="h-12 bg-background border-border text-base text-foreground placeholder:text-muted-foreground"
              />

              <div className="flex justify-end">
                <a
                  href="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </a>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-6 text-center space-y-3">
          <div className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a href="/signup" className="text-foreground hover:underline transition-colors">
              Sign up
            </a>
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
      </div>
    </div>
  );
}
