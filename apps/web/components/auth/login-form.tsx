'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { LoginForm as LoginFormView } from '@miguelfranken/ui/views/auth/login-form';
import { authClient } from '@/lib/auth/client';

/** Signs in with the auth client, then goes to `next`. */
export function LoginForm({ next = '/', email, hint, className }: { next?: string; email?: string; hint?: string; className?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <LoginFormView
      email={email}
      hint={hint}
      className={className}
      pending={pending}
      error={error}
      onSubmit={(values) => {
        setError(null);
        startTransition(async () => {
          const { error: signInError } = await authClient.signIn.email({ email: values.email.trim().toLowerCase(), password: values.password });
          if (signInError) {
            setError(signInError.message ?? 'Could not sign in. Check your email and password.');
            return;
          }
          router.push(next);
          router.refresh();
        });
      }}
    />
  );
}
