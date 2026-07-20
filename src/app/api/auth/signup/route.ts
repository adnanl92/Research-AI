import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // Until WashU SSO replaces credentials signup, ALLOWED_SIGNUP_DOMAINS
  // (comma-separated, e.g. "wustl.edu") restricts who can create an account
  // and burn LLM budget. Unset = open signup (local development only).
  const allowedDomains = (process.env.ALLOWED_SIGNUP_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  if (allowedDomains.length > 0) {
    const emailDomain = normalizedEmail.split("@")[1] ?? "";
    if (!allowedDomains.includes(emailDomain)) {
      return NextResponse.json(
        { error: "Sign-up is limited to approved email domains." },
        { status: 403 },
      );
    }
  }

  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  try {
    await db.user.create({
      data: { name, email: normalizedEmail, hashedPassword },
    });
  } catch (error) {
    // Two concurrent signups can both pass the findUnique check; the unique
    // constraint catches the loser — return the same 409 as the pre-check.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
