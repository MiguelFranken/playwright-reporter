'use client';

import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
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

/**
 * An image the host may serve at the size it is shown: `sizes` says how wide
 * it is on screen, and `width` × `height` are its own pixels when known, so
 * a host that resizes images (Next.js) can offer a set of widths to pick from.
 */
export interface ImageProps {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  /** The width the image is shown at, as the HTML attribute: `320px`. */
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
  ref?: Ref<HTMLImageElement>;
}

export type ImageComponent = ComponentType<ImageProps>;

/** Plain anchor. What Storybook and any non-Next host get. */
const DefaultLink: LinkComponent = ({ prefetch: _prefetch, ...props }) => <a {...props} />;

/** Plain image at its one URL. What Storybook and any host that does not resize images get. */
const DefaultImage: ImageComponent = ({ width, height, sizes: _sizes, loading = 'lazy', ...props }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img {...props} width={width ?? undefined} height={height ?? undefined} loading={loading} decoding="async" />
);

const UiContext = createContext<{ Link: LinkComponent; Image: ImageComponent }>({ Link: DefaultLink, Image: DefaultImage });

/**
 * Host integration point. The app passes `next/link` and an image component
 * built on `next/image`; everything else falls back to an anchor and an
 * `<img>`. These are the only things the design system needs to know about
 * its host.
 */
export function UiProvider({
  linkComponent,
  imageComponent,
  children,
}: {
  linkComponent?: LinkComponent;
  imageComponent?: ImageComponent;
  children: ReactNode;
}) {
  return <UiContext.Provider value={{ Link: linkComponent ?? DefaultLink, Image: imageComponent ?? DefaultImage }}>{children}</UiContext.Provider>;
}

export function useLink(): LinkComponent {
  return useContext(UiContext).Link;
}

export function useImage(): ImageComponent {
  return useContext(UiContext).Image;
}

/** Convenience for views: `<Link href="…">…</Link>` using the host's component. */
export function Link(props: LinkProps) {
  const Host = useLink();
  return <Host {...props} />;
}

/** One recording in progress: stop it for its transcript, or throw it away. */
export interface DictationRecording {
  /** Ends the recording and resolves with what was said (empty when nothing was). */
  stop: () => Promise<string>;
  cancel: () => void;
}

/**
 * Speech to text for the text boxes that offer it. `start` opens the
 * microphone and resolves once it is listening; it rejects (with a message
 * for the person) when the browser refuses. The host records and transcribes;
 * the design system only decides where the words go.
 */
export interface Dictation {
  start: () => Promise<DictationRecording>;
}

const DictationContext = createContext<Dictation | null>(null);

/** Offers dictation to the composers below it; without one they show no microphone. */
export function DictationProvider({ dictation, children }: { dictation: Dictation | null; children: ReactNode }) {
  return <DictationContext.Provider value={dictation}>{children}</DictationContext.Provider>;
}

export function useDictation(): Dictation | null {
  return useContext(DictationContext);
}
