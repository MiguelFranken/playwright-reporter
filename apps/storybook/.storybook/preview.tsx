import type { Preview } from '@storybook/react-vite';
import { withThemeByClassName } from '@storybook/addon-themes';
import { ThemeProvider } from 'next-themes';
import { UiProvider } from '@miguelfranken/ui/provider';
import { Toaster } from '@miguelfranken/ui/components/sonner';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@miguelfranken/ui/styles.css';
import './fonts.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    // The theme decorator paints bg-background; a second backdrop would fight it.
    backgrounds: { disable: true },
    a11y: { test: 'error' },
    controls: { expanded: true, matchers: { date: /At$/ } },
    options: {
      // Layer, then group, then component. Groups are listed so the sidebar
      // reads by purpose rather than alphabet; anything unlisted lands at `*`.
      storySort: {
        order: [
          'Docs',
          'Foundations',
          'Primitives',
          ['Forms', 'Actions', 'Overlays', 'Navigation', 'Layout', 'Feedback', 'Data display', '*'],
          'Patterns',
          ['Navigation', 'Status', 'Metrics & charts', 'States', 'Dialogs', 'Controls', 'Identity', '*'],
          'Marketing',
          ['Site chrome', 'Sections', 'Content', 'Demos', '*'],
          'Views',
          // Every domain is listed, alphabetically: a listed name sorts ahead
          // of every unlisted one, which would break the alphabet otherwise.
          [
            'Account',
            ['Profile', 'Access', 'AI', '*'],
            'Admin',
            ['Directory', 'Database', 'Storage', 'Retention', '*'],
            'Auth',
            'Branches',
            'Connect',
            'Dashboard',
            'Explorer',
            'Library',
            ['Dialogs', '*'],
            'Pull requests',
            'Review',
            ['Storyboard', 'Viewer', 'Comments', 'Screens', '*'],
            'Run',
            ['Header', 'Tab content', '*'],
            'Runs',
            'Settings',
            ['General', 'Integrations', '*'],
            'Shell',
            'Teams',
            'TestCases',
            ['Library', 'Case', 'Dialogs', '*'],
            '*',
          ],
          'Pages',
        ],
      },
    },
  },
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light' }),
    (Story, ctx) => (
      // next-themes is present so Toaster and ThemeToggle behave as in the app,
      // but the addon owns the `dark` class — hence forcedTheme.
      <ThemeProvider attribute="class" forcedTheme={ctx.globals.theme ?? 'light'} enableSystem={false}>
        <UiProvider>
          <div className="bg-background text-foreground font-sans antialiased">
            <Story />
          </div>
          <Toaster />
        </UiProvider>
      </ThemeProvider>
    ),
  ],
  globalTypes: {
    theme: { toolbar: { icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true } },
  },
  initialGlobals: { theme: 'light' },
};

export default preview;
