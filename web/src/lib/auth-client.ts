import { createAuthClient } from "better-auth/react";

// Le front est servi same-origin (nginx proxie /api). En dev, Vite proxie /api.
export const authClient = createAuthClient({
  basePath: "/api/auth",
});

export const { signIn, signUp, signOut, useSession } = authClient;
