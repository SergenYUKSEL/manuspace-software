import type { PublicUser } from "@manuspace/shared";
import type { User } from "./session";

export function toPublicUser(user: User): PublicUser {
	return {
		id: user.id,
		email: user.email,
		displayName: user.displayName,
		isAdmin: user.isAdmin,
		totpEnabled: user.totpEnabledAt !== null,
		blocked: user.blockedAt !== null,
	};
}
