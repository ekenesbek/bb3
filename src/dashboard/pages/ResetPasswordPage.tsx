import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const passwordStrength = checkPasswordStrength(formData.password);
  const passwordsMatch = formData.password === formData.confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!token) {
      setError("Invalid reset link. Please request a new one.");
      setIsLoading(false);
      return;
    }

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

    try {
      await authApi.resetPassword(token, formData.password);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to reset password. Please try again.");
    } finally {
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

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <Icons.alertCircle className="h-4 w-4" />
              <AlertDescription>
                Invalid or missing reset token. Please request a new password reset link.
              </AlertDescription>
            </Alert>
            <div className="mt-6 text-center">
              <Button onClick={() => navigate("/forgot-password")}>Request new link</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <span className="text-3xl">🦾</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Reset Password</h1>
          <p className="text-muted-foreground text-center mt-2">Create a new secure password</p>
        </div>

        <Card className="shadow-xl border-slate-200 dark:border-slate-800">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Choose new password</CardTitle>
            <CardDescription>Your new password must be strong and secure</CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
                <Icons.check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-900 dark:text-green-100">
                  Password reset successful! Redirecting to login...
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <Icons.alertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
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

                <Button
                  type="submit"
                  className="w-full h-11 text-base"
                  disabled={isLoading || passwordStrength.score < 5 || !passwordsMatch}
                >
                  {isLoading ? (
                    <>
                      <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                      Resetting password...
                    </>
                  ) : (
                    "Reset password"
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <div className="text-sm text-center text-muted-foreground">
              Remember your password?{" "}
              <a href="/login" className="text-primary font-medium hover:underline">
                Sign in
              </a>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
