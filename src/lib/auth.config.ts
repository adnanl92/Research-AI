import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config — imported by middleware.ts, so it must not
 * import Prisma, bcrypt, or anything Node-only. The full config (adapter +
 * Credentials provider) lives in auth.ts.
 */
export const authConfig = {
  // Trust the Host header. Required when self-hosting (npm run start,
  // Azure, etc.). Vercel is trusted automatically either way.
  trustHost: true,
  pages: {
    signIn: "/signin",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // Called by middleware for every matched request.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        pathname.startsWith("/signin") || pathname.startsWith("/signup");
      if (isPublic) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  providers: [], // filled in by auth.ts
} satisfies NextAuthConfig;
