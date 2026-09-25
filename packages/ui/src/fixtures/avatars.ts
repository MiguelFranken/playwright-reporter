/**
 * Profile images as inline SVG data URIs, so avatar stories never touch the
 * network and render the same on every run.
 */
function svg(background: string, foreground: string, shape: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${background}"/>${shape.replaceAll('FG', foreground)}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(markup)}`;
}

export const USER_AVATAR = svg('#c7d2fe', '#4338ca', '<circle cx="32" cy="25" r="11" fill="FG"/><path d="M12 58c2-12 10-18 20-18s18 6 20 18z" fill="FG"/>');

export const TEAM_AVATAR = svg('#0f766e', '#ccfbf1', '<path d="M18 44 32 16l14 28z" fill="FG"/><circle cx="32" cy="38" r="5" fill="#0f766e"/>');
