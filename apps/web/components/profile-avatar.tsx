import { Avatar, AvatarFallback, AvatarImage } from '@miguelfranken/ui/components/avatar';
import { cn } from '@miguelfranken/ui/lib/cn';
import { displayableAvatar } from '@/lib/avatars';

/**
 * A user's or team's profile image, with initials while it loads or when there
 * is none. People are round; teams are rounded squares, like the brand mark
 * they stand in for.
 */
export function ProfileAvatar({
  name,
  image,
  shape = 'circle',
  size,
  className,
  fallbackClassName,
}: {
  name: string;
  image: string | null | undefined;
  shape?: 'circle' | 'square';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  fallbackClassName?: string;
}) {
  const src = displayableAvatar(image);
  const square = shape === 'square';
  return (
    <Avatar size={size} className={cn(square && 'rounded-lg after:rounded-lg', className)}>
      {src ? <AvatarImage src={src} alt="" className={cn(square && 'rounded-lg')} /> : null}
      <AvatarFallback className={cn(square && 'rounded-lg', fallbackClassName)}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function initials(value: string) {
  const parts = value.split(/[\s@._-]+/).filter(Boolean);
  return (((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).slice(0, 2) || value.slice(0, 2)).toUpperCase();
}
