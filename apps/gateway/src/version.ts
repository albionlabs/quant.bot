export const UI_VERSION = '0.14.13';
export const MIN_WIDGET_VERSION = '0.1.0';

export function semverLt(a: string, b: string): boolean {
	const pa = a.split('.').map(Number);
	const pb = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
		if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
	}
	return false;
}
