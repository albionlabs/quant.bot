export function requireNonEmpty(name: string, value: string): string {
	if (!value.trim()) {
		throw new Error(`${name} environment variable is required`);
	}
	return value;
}
