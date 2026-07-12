import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Edge middleware uses the lightweight config (no Prisma/bcrypt).
// The `authorized` callback in auth.config.ts decides access:
// everything except /signin and /signup requires a session.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect all routes except Auth.js endpoints, Next internals, and
  // static assets. This covers "/", "/tools/*", and "/api/tools/*".
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
