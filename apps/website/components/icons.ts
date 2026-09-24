import {
  Activity,
  Bug,
  Camera,
  Cloud,
  Database,
  GitBranch,
  KeyRound,
  Layers,
  Radio,
  Repeat2,
  Route,
  Search,
  ShieldCheck,
  Timer,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureIconName } from '@/payload/blocks/feature-grid';

/**
 * The curated icon list, resolved. Editors pick a name from a select rather
 * than typing one, and this map is the other half of that contract — the
 * `Record` makes a name added to the block without an icon here a type error.
 */
export const featureIcons: Record<FeatureIconName, LucideIcon> = {
  Activity,
  Radio,
  Bug,
  Camera,
  Video,
  Route,
  Repeat2,
  ShieldCheck,
  Database,
  Cloud,
  Users,
  KeyRound,
  GitBranch,
  Layers,
  Timer,
  Search,
};
