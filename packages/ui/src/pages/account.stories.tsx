import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { CONNECTED_APPS, PERSONAL_TOKENS, PROFILE_TEAMS, SCOPE_PROJECTS, SCOPE_TEAMS } from '../fixtures/account';
import { USER_AVATAR } from '../fixtures/avatars';
import { AvatarPicker } from '../patterns/avatar-picker';
import { PageHeader } from '../patterns/page-header';
import { AccessTokens } from '../views/account/access-tokens';
import { ConnectedApps } from '../views/account/connected-apps';
import { ProfileDetails } from '../views/account/profile-details';
import { PushNotifications } from '../views/account/push-notifications';

const meta = {
  title: 'Pages/Account',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => {};

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

/**
 * Account, as a signed-in user sees it. The name, password and sessions forms
 * are the app's own and stand in here as placeholders.
 */
export const Default: Story = {
  render: () => (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <PageHeader title="Account" description="Your profile, password, notifications, access tokens and active sessions." />
      <Section title="Profile" description="How you appear to the rest of your teams.">
        <AvatarPicker name="Ada Lovelace" image={USER_AVATAR} onFileSelect={noop} onRemove={noop} />
        <ProfileDetails email="ada@acme.test" isSuperadmin={false} teams={PROFILE_TEAMS} />
      </Section>
      <Section title="Browser notifications" description="Set per browser: turning them on here does not turn them on elsewhere.">
        <PushNotifications
          state={{ kind: 'off' }}
          onEnable={noop}
          onDisable={noop}
          onPreferencesChange={noop}
          onTest={noop}
        />
      </Section>
      <Section title="Access tokens" description="Personal tokens for AI assistants that connect over MCP. Read-only, and never more than you can see.">
        <AccessTokens
          tokens={PERSONAL_TOKENS}
          teams={SCOPE_TEAMS}
          projects={SCOPE_PROJECTS}
          isSuperadmin={false}
          defaultDays={90}
          maxDays={365}
          setupHref="/account/ai"
          createOpen={false}
          onCreateOpenChange={noop}
          onCreate={noop}
          created={null}
          onCreatedDismiss={noop}
          onRevoke={noop}
        />
      </Section>
      <Section title="Connected apps" description="Assistants you connected over OAuth, such as claude.ai or ChatGPT.">
        <ConnectedApps apps={CONNECTED_APPS} onDisconnect={noop} />
      </Section>
      <Section title="Active sessions" description="Devices currently signed in with this account.">
        <Button variant="outline" size="sm" className="self-start">
          Sign out other sessions
        </Button>
      </Section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Generate token' })).toBeVisible();
  },
};

/** The shared demo account: it can look at everything and change nothing. */
export const DemoAccount: Story = {
  render: () => (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <PageHeader title="Account" description="Your profile, password, notifications, access tokens and active sessions." />
      <Section title="Profile" description="This is the shared demo account. It can look at everything and change nothing.">
        <ProfileDetails email="demo@playwright-reporter.test" isSuperadmin={false} teams={[]} />
      </Section>
    </div>
  ),
};
