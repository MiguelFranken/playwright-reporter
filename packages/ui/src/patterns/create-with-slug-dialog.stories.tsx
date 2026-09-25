import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CreateWithSlugDialog } from './create-with-slug-dialog';

const meta = {
  title: 'Patterns/CreateWithSlugDialog',
  component: CreateWithSlugDialog,
  tags: ['themed'],
  args: {
    open: true,
    onOpenChange: fn(),
    title: 'New project',
    description: 'A project collects the runs of one Playwright test suite.',
    idPrefix: 'new-project',
    pathPrefix: '/teams/acme/projects/',
    submitLabel: 'Create project',
    pendingLabel: 'Creating…',
    onSubmit: fn(),
  },
} satisfies Meta<typeof CreateWithSlugDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The slug follows the name until edited, and the URL follows the slug. */
export const Default: Story = {
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog', { name: 'New project' });
    const d = within(dialog);
    await expect(d.getByRole('button', { name: 'Create project' })).toBeDisabled();
    await userEvent.type(d.getByLabelText('Name'), 'Web Shop E2E');
    await expect(d.getByLabelText('Slug')).toHaveValue('web-shop-e2e');
    await expect(d.getByText('/teams/acme/projects/web-shop-e2e')).toBeVisible();
    await userEvent.click(d.getByRole('button', { name: 'Create project' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ name: 'Web Shop E2E', slug: 'web-shop-e2e' });
  },
};

/** Once edited, the slug stops following the name. */
export const EditedSlug: Story = {
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog'));
    await userEvent.type(d.getByLabelText('Name'), 'Acme');
    const slug = d.getByLabelText('Slug');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'shop');
    await userEvent.type(d.getByLabelText('Name'), ' Web');
    await expect(slug).toHaveValue('shop');
    await userEvent.click(d.getByRole('button', { name: 'Create project' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ name: 'Acme Web', slug: 'shop' });
  },
};

export const NewTeam: Story = {
  args: { title: 'New team', description: 'You become its first admin, so you can invite people right away.', idPrefix: 'new-team', pathPrefix: '/teams/', submitLabel: 'Create team' },
};

export const Pending: Story = {
  args: { pending: true },
  play: async () => {
    const d = within(await within(document.body).findByRole('dialog'));
    await expect(d.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  },
};
