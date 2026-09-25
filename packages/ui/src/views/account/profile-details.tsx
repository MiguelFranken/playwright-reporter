import { Badge } from '../../components/badge';
import { Link } from '../../provider';

export interface ProfileTeam {
  id: string;
  name: string;
  role: string;
  href: string;
}

export interface ProfileDetailsProps {
  email: string;
  isSuperadmin: boolean;
  teams: ProfileTeam[];
}

/** The read-only facts of an account: email, instance role, and the teams it belongs to. */
export function ProfileDetails({ email, isSuperadmin, teams }: ProfileDetailsProps) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Email</dt>
      <dd className="min-w-0 break-words">{email}</dd>
      <dt className="text-muted-foreground">Instance role</dt>
      <dd>
        <Badge variant={isSuperadmin ? 'default' : 'secondary'}>{isSuperadmin ? 'Superadmin' : 'User'}</Badge>
      </dd>
      <dt className="text-muted-foreground">Teams</dt>
      <dd className="flex flex-wrap gap-1.5">
        {teams.length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          teams.map((t) => (
            <Link key={t.id} href={t.href}>
              <Badge variant="outline">
                {t.name} · {t.role}
              </Badge>
            </Link>
          ))
        )}
      </dd>
    </dl>
  );
}
