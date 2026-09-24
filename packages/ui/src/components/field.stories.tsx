import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from './field';
import { Input } from './input';
import { Textarea } from './textarea';

const meta = {
  title: 'Primitives/Field',
  component: Field,
  argTypes: { orientation: { control: 'inline-radio', options: ['vertical', 'horizontal', 'responsive'] } },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Field {...args} className="max-w-md">
      <FieldLabel htmlFor="slug">Project slug</FieldLabel>
      <Input id="slug" defaultValue="web-e2e" />
      <FieldDescription>Used in the project URL. Lowercase, hyphens only.</FieldDescription>
    </Field>
  ),
};

/** The error takes `role="alert"`, so it is announced rather than merely coloured. */
export const WithError: Story = {
  render: (args) => (
    <Field {...args} className="max-w-md">
      <FieldLabel htmlFor="slug-invalid">Project slug</FieldLabel>
      <Input id="slug-invalid" defaultValue="Web E2E" aria-invalid />
      <FieldError>Slugs cannot contain spaces or capitals.</FieldError>
    </Field>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(/cannot contain spaces/i);
    await expect(canvas.getByLabelText('Project slug')).toBeInvalid();
  },
};

/** `errors` de-duplicates and renders a list when more than one survives. */
export const MultipleErrors: Story = {
  render: (args) => (
    <Field {...args} className="max-w-md">
      <FieldLabel htmlFor="slug-many">Project slug</FieldLabel>
      <Input id="slug-many" aria-invalid />
      <FieldError
        errors={[
          { message: 'Slug is required.' },
          { message: 'Slug must be at least 3 characters.' },
          { message: 'Slug is required.' },
        ]}
      />
    </Field>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('listitem')).toHaveLength(2);
  },
};

export const Horizontal: Story = {
  args: { orientation: 'horizontal' },
  render: (args) => (
    <Field {...args} className="max-w-xl">
      <FieldContent>
        <FieldLabel htmlFor="retain">
          <FieldTitle>Retain artifacts for</FieldTitle>
        </FieldLabel>
        <FieldDescription>Days to keep screenshots and traces of failed tests.</FieldDescription>
      </FieldContent>
      <Input id="retain" className="w-24" defaultValue="30" />
    </Field>
  ),
};

export const Grouped: Story = {
  render: () => (
    <FieldSet className="max-w-md">
      <FieldLegend>Project</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input id="name" defaultValue="Web end-to-end" />
        </Field>
        <FieldSeparator />
        <Field>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea id="notes" placeholder="Anything the team should know" />
          <FieldDescription>Shown on the project settings page.</FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  ),
};
