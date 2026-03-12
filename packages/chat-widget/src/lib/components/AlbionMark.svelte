<script lang="ts">
	import albionMarqueLightUrl from '../assets/albion-marque.svg';
	import albionMarqueDarkUrl from '../assets/albion-marque-dark.svg';

	let {
		size = 20,
		variant = 'light',
		decorative = true,
		alt = 'Albion'
	}: {
		size?: number;
		variant?: 'light' | 'dark';
		decorative?: boolean;
		alt?: string;
	} = $props();

	const src = $derived(variant === 'dark' ? albionMarqueDarkUrl : albionMarqueLightUrl);
</script>

<img
	{src}
	alt={decorative ? '' : alt}
	aria-hidden={decorative}
	width={size}
	height={size}
/>

<style>
	img {
		display: block;
		flex-shrink: 0;
	}
</style>
