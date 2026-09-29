export const PROJECT_ROLES = ["OWNER", "EDITOR", "COMMENTER", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

const ROLE_RANK: Record<ProjectRole, number> = {
	VIEWER: 0,
	COMMENTER: 1,
	EDITOR: 2,
	OWNER: 3,
};

/** Vrai si `role` donne au moins les droits de `required`. */
export function hasRole(role: ProjectRole, required: ProjectRole): boolean {
	return ROLE_RANK[role] >= ROLE_RANK[required];
}

export const NODE_TYPES = ["folder", "text", "file"] as const;
export type NodeType = (typeof NODE_TYPES)[number];
