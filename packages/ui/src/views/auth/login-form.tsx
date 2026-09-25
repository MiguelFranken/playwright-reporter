'use client';

import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '../../components/alert';
import { Button } from '../../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../../components/field';
import { Input } from '../../components/input';
import { cn } from '../../lib/cn';

export interface LoginFormProps {
  /** Pre-filled and locked, e.g. when an invitation names the account. */
  email?: string;
  /** Replaces "Continue to your test reports." under the title. */
  hint?: string;
  pending?: boolean;
  /** The last attempt's error. */
  error?: string | null;
  onSubmit: (values: { email: string; password: string }) => void;
  className?: string;
}

/** Email and password sign-in. The app talks to the auth client; this only collects and reports. */
export function LoginForm({ email: initialEmail = '', hint, pending = false, error, onSubmit, className }: LoginFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <Card className="shadow-e2">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>{hint ?? 'Continue to your test reports.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit({ email, password });
            }}
            noValidate
          >
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

      <FieldDescription className="text-center text-pretty">Accounts are created by invitation. Ask an administrator if you need access.</FieldDescription>
    </div>
  );
}
