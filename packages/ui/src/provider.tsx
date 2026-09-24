'use client';

import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
  type Ref,
} from 'react';

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
  /**
   * Forwarded to the underlying anchor. Base UI's `render` prop needs it:
   * `<Button render={<Link href=… />}>` mounts nothing without a ref to hold.
   */
  ref?: Ref<HTMLAnchorElement>;
};

export type LinkComponent = ComponentType<LinkProps>;

/** Plain anchor. What Storybook and any non-Next host get. */
const DefaultLink: LinkComponent = ({ prefetch: _prefetch, ...props }) => <a {...props} />;

const UiContext = createContext<{ Link: LinkComponent }>({ Link: DefaultLink });

/**
 * Host integration point. The app passes `next/link`; everything else falls
 * back to an anchor. This is the only thing the design system needs to know
 * about its host, which is why it is a single-value context and not a bag.
 */
export function UiProvider({
  linkComponent,
  children,
}: {
  linkComponent?: LinkComponent;
  children: ReactNode;
}) {
  return <UiContext.Provider value={{ Link: linkComponent ?? DefaultLink }}>{children}</UiContext.Provider>;
}

export function useLink(): LinkComponent {
  return useContext(UiContext).Link;
}

/** Convenience for views: `<Link href="…">…</Link>` using the host's component. */
export function Link(props: LinkProps) {
  const Host = useLink();
  return <Host {...props} />;
}
