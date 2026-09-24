import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { BarChart3, FlaskConical, ListChecks, Settings } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
} from './sidebar';

const NAV = [
  { label: 'Dashboard', icon: BarChart3, badge: undefined },
  { label: 'Runs', icon: ListChecks, badge: '482' },
  { label: 'Tests', icon: FlaskConical, badge: undefined },
  { label: 'Settings', icon: Settings, badge: undefined },
];

const meta = {
  title: 'Primitives/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['sidebar', 'floating', 'inset'] },
    collapsible: { control: 'inline-radio', options: ['offcanvas', 'icon', 'none'] },
    side: { control: 'inline-radio', options: ['left', 'right'] },
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

const Shell = (args: React.ComponentProps<typeof Sidebar>) => (
  <SidebarProvider>
    <Sidebar {...args}>
      <SidebarHeader className="px-2 py-1.5 text-label-m">web-e2e</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Project</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item, i) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton isActive={i === 1}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-2 py-1.5 text-body-xs text-muted-foreground">Acme</SidebarFooter>
    </Sidebar>
    <SidebarInset>
      <header className="flex h-12 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <span className="text-label-m">Runs</span>
      </header>
      <div className="p-6 text-body-s text-muted-foreground">Page content sits in the inset.</div>
    </SidebarInset>
  </SidebarProvider>
);

export const Default: Story = { render: Shell };
export const Floating: Story = { render: Shell, args: { variant: 'floating' } };
export const IconCollapsible: Story = { render: Shell, args: { collapsible: 'icon' } };
export const RightSide: Story = { render: Shell, args: { side: 'right' } };

export const Loading: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {Array.from({ length: 5 }, (_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset />
    </SidebarProvider>
  ),
};

/** The trigger collapses and restores the rail; `data-state` is what the CSS reads. */
export const TriggerCollapses: Story = {
  render: Shell,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /toggle sidebar/i });
    const wrapper = canvasElement.querySelector('[data-slot="sidebar-wrapper"], [data-state]');

    await userEvent.click(trigger);
    await expect(canvasElement.querySelector('[data-state="collapsed"]')).not.toBeNull();

    await userEvent.click(trigger);
    await expect(canvasElement.querySelector('[data-state="expanded"]')).not.toBeNull();
    void wrapper;
  },
};

/**
 * `useIsMobile` reads `window.innerWidth`, so the viewport parameter — not a CSS
 * media query alone — is what puts the sidebar into its sheet.
 */
export const Mobile: Story = {
  render: Shell,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
