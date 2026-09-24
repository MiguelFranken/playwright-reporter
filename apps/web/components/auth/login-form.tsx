'use client';

import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@miguelfranken/ui/components/alert';
import { Button } from '@miguelfranken/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@miguelfranken/ui/components/field';
import { Input } from '@miguelfranken/ui/components/input';
import { authClient } from '@/lib/auth/client';
import { cn } from '@miguelfranken/ui/lib/cn';

export function LoginForm({
  next = '/',
  email: initialEmail = '',
  hint,
  className,
}: {
  next?: string;
  email?: string;
  hint?: string;
  className?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error: signInError } = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
      if (signInError) {
        setError(signInError.message ?? 'Could not sign in. Check your email and password.');
        return;
      }
      router.push(next);
      router.refresh();
    });
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Card className="shadow-e2">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>{hint ?? 'Continue to your test reports.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="username"
                  required
                  autoFocus={!initialEmail}
                  readOnly={Boolean(initialEmail)}
                  aria-invalid={error ? true : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    autoFocus={Boolean(initialEmail)}
                    aria-invalid={error ? true : undefined}
                    className="pe-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-static
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute end-1 top-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </Field>

              {error ? (
                <Alert variant="destructive" role="alert" className="border-danger-border bg-danger-subtle">
                  <AlertCircle />
                  <AlertDescription className="text-danger-text">{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={pending || !email || !password}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <FieldDescription className="text-center text-pretty">
        Accounts are created by invitation. Ask an administrator if you need access.
      </FieldDescription>
    </div>
  );
}
