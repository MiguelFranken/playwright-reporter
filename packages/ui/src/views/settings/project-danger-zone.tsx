'use client';

import { Button } from '../../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/card';
import { DeleteProjectDialog } from '../teams/team-projects';

export interface ProjectDangerZoneProps {
  name: string;
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onDelete: (confirmation: string) => void;
}

/**
 * Deleting a project is the one irreversible action on its settings page, so
 * it gets its own card away from the settings people edit daily, plus the same
 * type-the-slug confirmation the team-level list uses.
 */
export function ProjectDangerZone({ name, slug, open, onOpenChange, pending = false, onDelete }: ProjectDangerZoneProps) {
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>Deleting this project removes every run, test result and artifact it holds. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" size="sm" onClick={() => onOpenChange(true)}>
          Delete project
        </Button>
      </CardContent>
      <DeleteProjectDialog project={open ? { name, slug } : null} onClose={() => onOpenChange(false)} pending={pending} onDelete={onDelete} />
    </Card>
  );
}
