'use server';

import { redirect } from 'next/navigation';
import { actionError, getCurrentUser, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { DEMO_READ_ONLY, isDemoUser } from '@/lib/auth/demo';
import { listAccessibleTeamIds, resolveProjectByIdFor } from '@/lib/auth/principal';
import { errorRedirect, validateAuthorizationRequest } from '@/lib/oauth/authorize';
import { issuer } from '@/lib/oauth/config';
import { createAuthorization } from '@/lib/oauth/tokens';

/** The original query of the authorization request, carried through the consent form verbatim. */
function paramsFrom(formData: FormData): Record<string, string> {
  const raw = String(formData.get('request') ?? '');
  return Object.fromEntries(new URLSearchParams(raw));
}

/**
 * The user approved. Everything is validated again — the form's hidden
 * fields are client input — before a grant and a code are created and the
 * browser is sent back to the application.
 */
export async function approveConnection(formData: FormData): Promise<Denied | never> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  // The demo account is shared by every visitor; a grant would outlive their visit.
  if (isDemoUser(user)) return actionError(DEMO_READ_ONLY);
  const validation = await validateAuthorizationRequest(paramsFrom(formData));
  if (!validation.ok) {
    if (validation.kind === 'redirect') redirect(validation.redirectTo);
    return actionError(validation.message);
  }
  const { request } = validation;
  const access = String(formData.get('access') ?? 'all');
  const self = { user, grant: null };
  let teamIds: string[] | null = null;
  let projectId: string | null = null;
  let allTeams = false;
  if (access.startsWith('team:')) {
    const teamId = access.slice(5);
    if (!(await listAccessibleTeamIds(self)).includes(teamId)) return actionError('Team not found.');
    teamIds = [teamId];
  } else if (access.startsWith('project:')) {
    const project = await resolveProjectByIdFor(self, access.slice(8));
    if (!project) return actionError('Project not found.');
    projectId = project.project.id;
    teamIds = [project.team.id];
  } else if (access === 'superadmin') {
    if (!user.isSuperadmin) return actionError('Only superadmins can grant access to every team.');
    allTeams = true;
  }
  const { code, grantId } = await createAuthorization({
    userId: user.id,
    client: request.client,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    restrictions: { scopes: request.scopes, teamIds, projectId, allTeams },
  });
  await audit('oauth.grant', {
    actorId: user.id,
    teamId: teamIds?.length === 1 ? teamIds[0] : null,
    projectId,
    target: { grantId, client: request.client.clientName, clientId: request.client.clientId, allTeams },
  });
  const target = new URL(request.redirectUri);
  target.searchParams.set('code', code);
  if (request.state) target.searchParams.set('state', request.state);
  target.searchParams.set('iss', issuer());
  redirect(target.toString());
}

export async function denyConnection(formData: FormData): Promise<Denied | never> {
  const validation = await validateAuthorizationRequest(paramsFrom(formData));
  if (!validation.ok) {
    if (validation.kind === 'redirect') redirect(validation.redirectTo);
    return actionError(validation.message);
  }
  redirect(errorRedirect(validation.request.redirectUri, 'access_denied', 'The user denied the request.', validation.request.state));
}
