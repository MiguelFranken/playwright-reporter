import { ProfileAvatar as ProfileAvatarView, type ProfileAvatarProps } from '@miguelfranken/ui/patterns/profile-avatar';
import { displayableAvatar } from '@/lib/avatars';

/**
 * The design system's avatar, fed only URLs this app issued: anything else in
 * the column falls back to initials instead of making the viewer's browser
 * fetch a third-party image.
 */
export function ProfileAvatar({ image, ...props }: ProfileAvatarProps) {
  return <ProfileAvatarView {...props} image={displayableAvatar(image)} />;
}
