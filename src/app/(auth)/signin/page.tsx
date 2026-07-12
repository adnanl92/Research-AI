import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    // Suspense is required because SignInForm reads useSearchParams().
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
