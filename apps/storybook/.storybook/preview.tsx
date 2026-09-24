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
      storySort: { order: ['Docs', 'Foundations', 'Primitives', 'Patterns', 'Marketing', 'Views', 'Pages'] },
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
