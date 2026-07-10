import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Le front est servi same-origin (nginx proxie /api). En dev, Vite proxie /api.
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [magicLinkClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
