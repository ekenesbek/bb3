import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = typeof originalRequest?.url === "string" ? originalRequest.url : "";
    const isAuthRequest =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/check-user") ||
      requestUrl.includes("/auth/oauth");

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) {
          throw new Error("No refresh token");
        }

        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export interface User {
  id: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  planType: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterResponse {
  user: User;
  tenant: Tenant;
  tokens: AuthTokens;
}

export interface LoginResponse {
  user: User;
  tenant: Tenant;
  tokens: AuthTokens;
}

export const authApi = {
  // User Check
  checkUser: async (email: string): Promise<{ exists: boolean }> => {
    const response = await api.post("/auth/check-user", { email });
    return response.data;
  },

  // Email/Password Authentication
  register: async (data: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<RegisterResponse> => {
    const response = await api.post("/auth/register", data);
    return response.data;
  },

  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await api.post("/auth/login", { email, password });
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post("/auth/logout");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  },

  logoutAll: async (): Promise<void> => {
    await api.post("/auth/logout-all");
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  },

  // OAuth
  getGoogleAuthUrl: async (): Promise<{ url: string }> => {
    const response = await api.get("/auth/oauth/google/url");
    return response.data;
  },

  handleGoogleCallback: async (code: string): Promise<LoginResponse> => {
    const response = await api.post("/auth/oauth/google/callback", { code });
    return response.data;
  },

  getAppleAuthUrl: async (): Promise<{ url: string }> => {
    const response = await api.get("/auth/oauth/apple/url");
    return response.data;
  },

  handleAppleCallback: async (code: string, state: string): Promise<LoginResponse> => {
    const response = await api.post("/auth/oauth/apple/callback", { code, state });
    return response.data;
  },

  handleTelegramAuth: async (authData: any): Promise<LoginResponse> => {
    const response = await api.post("/auth/oauth/telegram", authData);
    return response.data;
  },

  // Email Verification
  verifyEmail: async (token: string): Promise<void> => {
    await api.post("/auth/verify-email", { token });
  },

  resendVerification: async (): Promise<void> => {
    await api.post("/auth/resend-verification");
  },

  // Password Reset
  requestPasswordReset: async (email: string): Promise<void> => {
    await api.post("/auth/reset-password/request", { email });
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    await api.post("/auth/reset-password/confirm", { token, newPassword });
  },

  // User Info
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get("/auth/me");
    return response.data.user;
  },

  // Token Management
  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    const response = await api.post("/auth/refresh", { refreshToken });
    return response.data;
  },
};

export default api;
