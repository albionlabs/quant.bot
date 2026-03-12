export type Theme = 'light' | 'dark';

const light: Record<string, string> = {
	/* Surface */
	'--cw-bg': '#ffffff',
	'--cw-border': '#e5e7eb',
	'--cw-border-subtle': '#d1d5db',

	/* Header (always dark for brand, but define for completeness) */
	'--cw-header-bg': '#1f2937',

	/* Text */
	'--cw-text': '#1f2937',
	'--cw-text-secondary': '#6b7280',
	'--cw-text-muted': '#9ca3af',

	/* Assistant bubble */
	'--cw-assistant-bg': '#f3f4f6',
	'--cw-assistant-text': '#1f2937',

	/* System bubble */
	'--cw-system-bg': '#fef3c7',
	'--cw-system-text': '#92400e',

	/* Input */
	'--cw-input-bg': '#ffffff',
	'--cw-input-border': '#d1d5db',
	'--cw-input-disabled-bg': '#f9fafb',

	/* Accent (user bubbles, primary buttons) */
	'--cw-accent': '#3b82f6',
	'--cw-accent-hover': '#2563eb',

	/* Secondary buttons */
	'--cw-btn-secondary-bg': '#1f2937',
	'--cw-btn-secondary-hover': '#374151',

	/* Review button */
	'--cw-review-btn-bg': 'rgba(255, 255, 255, 0.75)',
	'--cw-review-btn-text': '#111827',
	'--cw-review-btn-border': 'rgba(31, 41, 55, 0.2)',

	/* Status */
	'--cw-success-bg': '#ecfdf3',
	'--cw-success-text': '#166534',
	'--cw-error-bg': '#fef2f2',
	'--cw-error-text': '#991b1b',
	'--cw-info-bg': '#eff6ff',
	'--cw-info-text': '#1d4ed8',

	/* Hash links */
	'--cw-hash-bg': '#f0fdf4',
	'--cw-hash-text': '#166534',
	'--cw-hash-hover-bg': '#dcfce7',
	'--cw-hash-link': '#065f46',

	/* Order hash */
	'--cw-order-bg': '#eff6ff',
	'--cw-order-text': '#1e40af',
	'--cw-order-label': '#1d4ed8',

	/* Bundle summary */
	'--cw-bundle-text': '#374151',
	'--cw-tx-card-border': '#d1d5db',

	/* Code / details */
	'--cw-code-bg': '#f8fafc',
	'--cw-code-text': '#0f172a',
	'--cw-details-bg': '#f8fafc',
	'--cw-details-text': '#334155',
	'--cw-details-label': '#475569',

	/* Modal */
	'--cw-modal-bg': '#ffffff',
	'--cw-modal-title': '#111827',
	'--cw-modal-close-bg': '#f9fafb',
	'--cw-modal-close-border': '#d1d5db',
	'--cw-modal-close-text': '#111827',
	'--cw-modal-header-border': '#e5e7eb',
	'--cw-backdrop': 'rgba(17, 24, 39, 0.45)',

	/* Typing indicator */
	'--cw-typing-bg': '#f3f4f6',
	'--cw-typing-dot': '#9ca3af',

	/* Spinner */
	'--cw-spinner-track': '#e5e7eb',
	'--cw-spinner-head': '#1f2937',

	/* Panel shadow */
	'--cw-shadow': '0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',

	/* FAB */
	'--cw-fab-bg': '#ffffff',
	'--cw-fab-text': '#30407d',
	'--cw-fab-border': '1px solid #e5e7eb',
	'--cw-fab-shadow': '0 4px 12px rgba(0, 0, 0, 0.1)',
	'--cw-fab-shadow-hover': '0 6px 16px rgba(0, 0, 0, 0.15)',
};

const dark: Record<string, string> = {
	/* Surface */
	'--cw-bg': '#111827',
	'--cw-border': '#374151',
	'--cw-border-subtle': '#4b5563',

	/* Header */
	'--cw-header-bg': '#0d1117',

	/* Text */
	'--cw-text': '#e5e7eb',
	'--cw-text-secondary': '#9ca3af',
	'--cw-text-muted': '#6b7280',

	/* Assistant bubble */
	'--cw-assistant-bg': '#1f2937',
	'--cw-assistant-text': '#e5e7eb',

	/* System bubble */
	'--cw-system-bg': '#422006',
	'--cw-system-text': '#fef3c7',

	/* Input */
	'--cw-input-bg': '#1f2937',
	'--cw-input-border': '#4b5563',
	'--cw-input-disabled-bg': '#1f2937',

	/* Accent */
	'--cw-accent': '#3b82f6',
	'--cw-accent-hover': '#2563eb',

	/* Secondary buttons */
	'--cw-btn-secondary-bg': '#374151',
	'--cw-btn-secondary-hover': '#4b5563',

	/* Review button */
	'--cw-review-btn-bg': 'rgba(255, 255, 255, 0.1)',
	'--cw-review-btn-text': '#e5e7eb',
	'--cw-review-btn-border': 'rgba(255, 255, 255, 0.2)',

	/* Status */
	'--cw-success-bg': '#052e16',
	'--cw-success-text': '#86efac',
	'--cw-error-bg': '#450a0a',
	'--cw-error-text': '#fca5a5',
	'--cw-info-bg': '#172554',
	'--cw-info-text': '#93c5fd',

	/* Hash links */
	'--cw-hash-bg': '#052e16',
	'--cw-hash-text': '#86efac',
	'--cw-hash-hover-bg': '#064e3b',
	'--cw-hash-link': '#34d399',

	/* Order hash */
	'--cw-order-bg': '#172554',
	'--cw-order-text': '#93c5fd',
	'--cw-order-label': '#60a5fa',

	/* Bundle summary */
	'--cw-bundle-text': '#d1d5db',
	'--cw-tx-card-border': '#4b5563',

	/* Code / details */
	'--cw-code-bg': '#1e293b',
	'--cw-code-text': '#e2e8f0',
	'--cw-details-bg': '#1e293b',
	'--cw-details-text': '#cbd5e1',
	'--cw-details-label': '#94a3b8',

	/* Modal */
	'--cw-modal-bg': '#1f2937',
	'--cw-modal-title': '#f9fafb',
	'--cw-modal-close-bg': '#374151',
	'--cw-modal-close-border': '#4b5563',
	'--cw-modal-close-text': '#e5e7eb',
	'--cw-modal-header-border': '#374151',
	'--cw-backdrop': 'rgba(0, 0, 0, 0.6)',

	/* Typing indicator */
	'--cw-typing-bg': '#1f2937',
	'--cw-typing-dot': '#6b7280',

	/* Spinner */
	'--cw-spinner-track': '#374151',
	'--cw-spinner-head': '#e5e7eb',

	/* Panel shadow */
	'--cw-shadow': '0 8px 30px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.2)',

	/* FAB */
	'--cw-fab-bg': '#1f2937',
	'--cw-fab-text': '#ffffff',
	'--cw-fab-border': '1px solid #374151',
	'--cw-fab-shadow': '0 4px 12px rgba(0, 0, 0, 0.3)',
	'--cw-fab-shadow-hover': '0 6px 16px rgba(0, 0, 0, 0.4)',
};

const themes = { light, dark } as const;

export function getThemeStyle(theme: Theme): string {
	const vars = themes[theme];
	return Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('; ');
}
