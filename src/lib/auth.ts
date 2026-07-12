import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
// import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await db.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user?.hashedPassword) return null;

        const valid = await bcrypt.compare(password, user.hashedPassword);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),

    // ------------------------------------------------------------------
    // Microsoft Entra ID (WashU SSO) — READY TO ACTIVATE.
    //
    // When WashU IT provides the tenant/client IDs:
    //   1. Uncomment the import at the top of this file.
    //   2. Uncomment the provider block below.
    //   3. Set these in the environment (see .env.example):
    //        AUTH_MICROSOFT_ENTRA_ID_ID       (application/client ID)
    //        AUTH_MICROSOFT_ENTRA_ID_SECRET   (client secret)
    //        AUTH_MICROSOFT_ENTRA_ID_TENANT_ID (WashU tenant ID)
    //   4. Optionally remove the Credentials provider above (and the
    //      /signup page) to make SSO the only sign-in path.
    //
    // MicrosoftEntraID({
    //   clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    //   clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    //   issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
    // }),
    // ------------------------------------------------------------------
  ],
});
