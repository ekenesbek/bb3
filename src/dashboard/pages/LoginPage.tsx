import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Icons } from "@/components/Icons";
import { authApi } from "@/lib/api/auth";
import bb8Icon from "@/assets/bb8.png";

export function LoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual API call to check if user exists
      // For now, mock the check based on email
      const userExists = Math.random() > 0.5; // Mock: random check

      if (userExists) {
        // User exists - go to login password page
        navigate("/login/password", { state: { email: formData.email } });
      } else {
        // User doesn't exist - go to create account page
        navigate("/create-account/password", { state: { email: formData.email } });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to process. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: "google" | "apple") => {
    setIsLoading(true);
    setError(null);

    try {
      if (provider === "google") {
        const { url } = await authApi.getGoogleAuthUrl();
        window.location.href = url;
      } else if (provider === "apple") {
        // Apple Sign In flow
        const { url } = await authApi.getAppleAuthUrl();
        window.location.href = url;
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to initialize OAuth. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo and Heading */}
        <div className="flex flex-col items-center mb-12">
          <div className="w-24 h-24 mb-6 flex items-center justify-center bg-white rounded-full p-2">
            <img src={bb8Icon} alt="BB-8" className="w-full h-full object-contain" />
          </div>
          <h1
            className="text-5xl font-normal tracking-tight text-foreground text-center mb-4"
            style={{ fontFamily: "serif" }}
          >
            Impossible?
            <br />
            Possible.
          </h1>
          <p className="text-foreground/80 text-center text-base">The AI for problem solvers</p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-2xl border border-border p-8 shadow-2xl">
          <div className="space-y-4">
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
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isLoading}
                required
                className="h-12 bg-secondary/30 border-border text-base placeholder:text-muted-foreground"
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
              By continuing, you acknowledge Anthropic's{" "}
              <a href="/privacy" className="underline hover:text-foreground transition-colors">
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>

        {/* Additional Links */}
        <div className="mt-6 text-center space-y-2">
          <div className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a href="/signup" className="text-foreground hover:underline transition-colors">
              Sign up
            </a>
          </div>

          <div className="text-xs text-muted-foreground">
            Already have self-hosted setup?{" "}
            <a href="/import-config" className="text-foreground hover:underline transition-colors">
              Import your settings
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
