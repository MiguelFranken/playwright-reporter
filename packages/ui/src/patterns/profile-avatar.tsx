import { Avatar, AvatarFallback, AvatarImage } from '../components/avatar';
import { cn } from '../lib/cn';
import { initials } from '../lib/initials';

export interface ProfileAvatarProps {
  /** Who or what the image stands for; its initials show while it loads or when there is none. */
  name: string;
  /**
   * The image URL, already vetted by the host. The app only passes URLs it
   * issued itself, so a viewer's browser never fetches a third-party image.
   */
  image: string | null | undefined;
  /** People are round; teams are rounded squares, like the brand mark they stand in for. */
  shape?: 'circle' | 'square';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  fallbackClassName?: string;
}

/** A user's or team's profile image, with initials while it loads or when there is none. */
export function ProfileAvatar({ name, image, shape = 'circle', size, className, fallbackClassName }: ProfileAvatarProps) {
  const square = shape === 'square';
  return (
    <Avatar size={size} className={cn(square && 'rounded-lg after:rounded-lg', className)}>
      {image ? <AvatarImage src={image} alt="" className={cn(square && 'rounded-lg')} /> : null}
      <AvatarFallback className={cn(square && 'rounded-lg', fallbackClassName)}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
