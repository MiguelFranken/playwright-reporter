import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { Badge } from './badge';

const meta = {
  title: 'Primitives/Card',
  component: Card,
  argTypes: { size: { control: 'inline-radio', options: ['default', 'sm'] } },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="max-w-md">
      <CardHeader>
        <CardTitle>Reporter token</CardTitle>
        <CardDescription>Used by the Playwright reporter to authenticate ingest.</CardDescription>
      </CardHeader>
      <CardContent>
        <code className="text-code-s">pwr_live_9f2c…8a41</code>
      </CardContent>
    </Card>
  ),
};

export const WithAction: Story = {
  render: (args) => (
    <Card {...args} className="max-w-md">
      <CardHeader>
        <CardTitle>Storage</CardTitle>
        <CardDescription>Where screenshots, videos and traces are kept.</CardDescription>
        <CardAction>
          <Badge variant="outline">local</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>Artifacts are written to the server&rsquo;s disk under `.artifacts/`.</CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: (args) => (
    <Card {...args} className="max-w-md">
      <CardHeader>
        <CardTitle>Delete project</CardTitle>
        <CardDescription>Removes every run, result and artifact. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </CardFooter>
    </Card>
  ),
};

/** `size="sm"` tightens the spacing token the whole card is built from. */
export const Sizes: Story = {
  render: () => (
    <div className="grid gap-4 md:grid-cols-2">
      {(['default', 'sm'] as const).map((size) => (
        <Card key={size} size={size}>
          <CardHeader>
            <CardTitle>size={size}</CardTitle>
            <CardDescription>--card-spacing drives padding and gap alike.</CardDescription>
          </CardHeader>
          <CardContent>Body copy.</CardContent>
        </Card>
      ))}
    </div>
  ),
};
