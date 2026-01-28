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
import { Checkbox } from "@/components/ui/checkbox";
import { Icons } from "@/components/Icons";
import { authApi } from "@/lib/api/auth";

interface PasswordStrength {
  score: number;
  feedback: string[];
}

function checkPasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else feedback.push("At least 8 characters");

  if (/[A-Z]/.test(password)) score++;
  else feedback.push("One uppercase letter");

  if (/[a-z]/.test(password)) score++;
  else feedback.push("One lowercase letter");

  if (/\d/.test(password)) score++;
  else feedback.push("One number");

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;
  else feedback.push("One special character");

  return { score, feedback };
}

export function SignupPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
  });

  const passwordStrength = checkPasswordStrength(formData.password);
  const passwordsMatch = formData.password === formData.confirmPassword;

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validation
    if (passwordStrength.score < 5) {
      setError("Password does not meet requirements");
      setIsLoading(false);
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy");
      setIsLoading(false);
      return;
    }

    try {
      const result = await authApi.register({
        email: formData.email,
        password: formData.password,
        displayName: formData.displayName,
      });

      localStorage.setItem("accessToken", result.tokens.accessToken);
      localStorage.setItem("refreshToken", result.tokens.refreshToken);

      // Redirect to onboarding
      navigate("/onboarding");
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create account. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignup = async (provider: "google" | "apple") => {
    setIsLoading(true);
    setError(null);

    try {
      if (provider === "google") {
        const { url } = await authApi.getGoogleAuthUrl();
        window.location.href = url;
      } else if (provider === "apple") {
        const { url } = await authApi.getAppleAuthUrl();
        window.location.href = url;
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to initialize OAuth. Please try again.");
      setIsLoading(false);
    }
  };

  const getPasswordStrengthColor = (score: number) => {
    if (score <= 2) return "bg-red-500";
    if (score <= 3) return "bg-orange-500";
    if (score <= 4) return "bg-yellow-500";
    return "bg-green-500";
  };

  const getPasswordStrengthText = (score: number) => {
    if (score <= 2) return "Weak";
    if (score <= 3) return "Fair";
    if (score <= 4) return "Good";
    return "Strong";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <span className="text-3xl">🦾</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Join Clawdbot</h1>
          <p className="text-muted-foreground text-center mt-2">
            Get started in less than 5 minutes
          </p>
        </div>

        <Card className="shadow-xl border-slate-200 dark:border-slate-800">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Create account</CardTitle>
            <CardDescription>Choose your preferred sign-up method</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* OAuth Buttons */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full h-11 text-base"
                onClick={() => handleOAuthSignup("google")}
                disabled={isLoading}
              >
                <Icons.google className="mr-2 h-5 w-5" />
                Continue with Google
              </Button>

              {/* Temporarily hide Apple sign-up until it’s wired up
              <Button
                variant="outline"
                className="w-full h-11 text-base"
                onClick={() => handleOAuthSignup('apple')}
                disabled={isLoading}
              >
                <Icons.apple className="mr-2 h-5 w-5" />
                Continue with Apple
              </Button>
              */}
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <Icons.alertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Email/Password Form */}
            <form onSubmit={handleEmailSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  disabled={isLoading}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={isLoading}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={isLoading}
                  required
                  className="h-11"
                />
                {formData.password && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${getPasswordStrengthColor(passwordStrength.score)}`}
                          style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {getPasswordStrengthText(passwordStrength.score)}
                      </span>
                    </div>
                    {passwordStrength.feedback.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Required: {passwordStrength.feedback.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  disabled={isLoading}
                  required
                  className="h-11"
                />
                {formData.confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                  disabled={isLoading}
                />
                <label
                  htmlFor="terms"
                  className="text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I agree to the{" "}
                  <a href="/terms" className="text-primary hover:underline" target="_blank">
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a href="/privacy" className="text-primary hover:underline" target="_blank">
                    Privacy Policy
                  </a>
                </label>
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base"
                disabled={
                  isLoading || !agreedToTerms || passwordStrength.score < 5 || !passwordsMatch
                }
              >
                {isLoading ? (
                  <>
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <div className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <a href="/login" className="text-primary font-medium hover:underline">
                Sign in
              </a>
            </div>
          </CardFooter>
        </Card>

        {/* Security Notice */}
        <Card className="mt-6 border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Icons.alertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  Security Notice
                </p>
                <p className="text-xs text-orange-800 dark:text-orange-200">
                  The connected AI agent can trigger powerful actions on your devices, including
                  running commands, reading/writing files, and capturing screenshots. Only enable
                  Clawdbot if you understand the risks and trust the integrations you use.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
