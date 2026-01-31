import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Icons } from "@/components/Icons";
import { authApi } from "@/lib/api/auth";

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const provider = searchParams.get("provider");
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");

      if (error) {
        setError(`OAuth error: ${error}`);
        setTimeout(() => navigate("/login"), 3000);
        return;
      }

      if (!code) {
        setError("Missing authorization code");
        setTimeout(() => navigate("/login"), 3000);
        return;
      }

      try {
        let result;

        switch (provider) {
          case "google":
            result = await authApi.handleGoogleCallback(code);
            break;
          case "apple":
            if (!state) {
              throw new Error("Missing state parameter for Apple Sign In");
            }
            result = await authApi.handleAppleCallback(code, state);
            break;
          default:
            throw new Error(`Unknown OAuth provider: ${provider}`);
        }

        // Save tokens and user info to localStorage
        localStorage.setItem("cb.auth.tokens", JSON.stringify(result.tokens));
        localStorage.setItem("cb.auth.user", JSON.stringify(result.user));
        localStorage.setItem("cb.auth.tenant", JSON.stringify(result.tenant));

        // Exchange JWT for Gateway token
        const gatewayTokenResponse = await authApi.exchangeForGatewayToken(
          result.tokens.accessToken,
        );

        // Redirect to Control UI with gateway token
        const controlUiBase = import.meta.env.VITE_CONTROL_UI_BASE || "/";
        window.location.assign(`${controlUiBase}/chat?token=${gatewayTokenResponse.gatewayToken}`);
      } catch (err: any) {
        console.error("OAuth callback error:", err);
        setError(err.response?.data?.error || err.message || "Authentication failed");
        setTimeout(() => navigate("/login"), 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="pt-6">
          {error ? (
            <Alert variant="destructive">
              <Icons.alertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <Icons.spinner className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-2">Completing sign-in...</h2>
                <p className="text-sm text-muted-foreground">
                  Please wait while we verify your credentials
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
