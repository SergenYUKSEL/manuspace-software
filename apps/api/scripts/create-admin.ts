/**
 * Crée un compte administrateur (premier démarrage, pas d'inscription publique).
 * Usage : bun run --cwd apps/api create-admin <email> "<Nom affiché>"
 * Le mot de passe est demandé de façon interactive, ou lu depuis ADMIN_PASSWORD.
 */
import { createDb, schema } from "@manuspace/db";
import { createUserSchema } from "@manuspace/shared";

const [email, displayName] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD ?? prompt("Mot de passe (12 caractères min.) :");

if (password === null) {
	console.error(
		"\nAucun mot de passe saisi : pas de terminal interactif. " +
			"Lancez la commande depuis un vrai terminal, ou passez ADMIN_PASSWORD.",
	);
	process.exit(1);
}

const parsed = createUserSchema.safeParse({ email, displayName, password, isAdmin: true });
if (!parsed.success) {
	console.error('Usage : bun run --cwd apps/api create-admin <email> "<Nom affiché>"');
	for (const issue of parsed.error.issues)
		console.error(`- ${issue.path.join(".")} : ${issue.message}`);
	process.exit(1);
}

const db = createDb(process.env.DATABASE_URL as string);
const { password: plain, ...values } = parsed.data;
await db
	.insert(schema.users)
	.values({ ...values, passwordHash: await Bun.password.hash(plain) })
	.onConflictDoUpdate({ target: schema.users.email, set: { isAdmin: true, blockedAt: null } });

console.log(`✓ Administrateur ${values.email} prêt`);
process.exit(0);
