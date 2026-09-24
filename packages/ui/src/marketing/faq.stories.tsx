import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { faqItems } from '../fixtures/marketing';
import { Faq } from './faq';

const meta = {
  title: 'Marketing/Faq',
  component: Faq,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    header: { eyebrow: 'FAQ', heading: 'Questions engineers actually ask' },
    items: faqItems.map((item) => ({ ...item, answer: <p>{item.answer}</p> })),
  },
} satisfies Meta<typeof Faq>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OpensAnAnswer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /replace the playwright trace viewer/i });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(await canvas.findByText(/trace\.playwright\.dev/)).toBeVisible();
  },
};

export const SingleItem: Story = {
  args: { items: [{ question: 'Is it really free?', answer: <p>Yes. MIT, and self-hosted.</p> }] },
};

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
