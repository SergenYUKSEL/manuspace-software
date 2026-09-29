import { createTOTPKeyURI, verifyTOTPWithGracePeriod } from "@oslojs/otp";
import { decrypt, encrypt } from "./crypto";

const PERIOD = 30;
const DIGITS = 6;

export async function generateTotpSecret(accountName: string) {
	const key = crypto.getRandomValues(new Uint8Array(20));
	return {
		encrypted: await encrypt(key),
		uri: createTOTPKeyURI("Manuspace", accountName, key, PERIOD, DIGITS),
	};
}

/** Accepte le code courant et celui de la période précédente (décalage d'horloge). */
export async function verifyTotp(encryptedSecret: string, code: string): Promise<boolean> {
	const key = await decrypt(encryptedSecret);
	return verifyTOTPWithGracePeriod(key, PERIOD, DIGITS, code, PERIOD);
}
