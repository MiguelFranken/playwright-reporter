import { MailQuestion } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { CreateAccountForm, JoinTeamButton, WrongAccountNotice } from '@/components/auth/invite-forms';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';
import { getCurrentUser } from '@/lib/auth/access';
import { resolveInvitation } from '@/lib/auth/invitations';
import { TEAM_ROLE_DESCRIPTIONS, TEAM_ROLE_LABELS } from '@/lib/auth/permissions';
import { getUserByEmail } from '@/lib/db/queries/teams';
import { formatDateTime } from '@repo/ui/lib/format';

export const metadata: Metadata = { title: 'Invitation' };

type Params = Promise<{ token: string }>;

export default function InvitePage({ params }: { params: Params }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-md rounded-xl" />}>
        <InviteContent params={params} />
      </Suspense>
    </main>
  );
}

async function InviteContent({ params }: { params: Params }) {
  const { token } = await params;
  const invitation = await resolveInvitation(token);

  // One neutral message for revoked, expired, already-used and unknown tokens:
  // distinguishing them would let someone probe for valid links.
  if (!invitation) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
            <MailQuestion className="size-5 text-muted-foreground" />
          </div>
          <CardTitle>This invitation is invalid or has expired</CardTitle>
          <CardDescription>Ask whoever invited you to send a fresh link.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/login" />}>
            Go to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  const [user, existingAccount] = await Promise.all([getCurrentUser(), getUserByEmail(invitation.email)]);

  // Signed in with a different account.
  if (user && user.email.toLowerCase() !== invitation.email) {
    return (
      <InviteCard invitation={invitation}>
        <WrongAccountNotice invitedEmail={invitation.email} currentEmail={user.email} />
      </InviteCard>
    );
  }

  // Signed in with the invited email.
  if (user) {
    return (
      <InviteCard invitation={invitation}>
        <JoinTeamButton token={token} teamName={invitation.teamName} />
      </InviteCard>
    );
  }

  // Signed out, account already exists: sign in and come back here.
  if (existingAccount) {
    return <LoginForm next={`/invite/${token}`} email={invitation.email} hint={`Sign in to join ${invitation.teamName}`} />;
  }

  // Signed out, no account: create one.
  return (
    <InviteCard invitation={invitation}>
      <CreateAccountForm token={token} email={invitation.email} />
    </InviteCard>
  );
}

function InviteCard({
  invitation,
  children,
}: {
  invitation: { teamName: string; email: string; role: 'admin' | 'member' | 'viewer'; expiresAt: Date };
  children: React.ReactNode;
}) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          You have been invited to {invitation.teamName}{' '}
          <Badge variant="secondary" className="align-middle">
            {TEAM_ROLE_LABELS[invitation.role]}
          </Badge>
        </CardTitle>
        <CardDescription>
          For {invitation.email}. {TEAM_ROLE_DESCRIPTIONS[invitation.role]} This link expires {formatDateTime(invitation.expiresAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
