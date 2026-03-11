<script lang="ts">
	import albionMarqueUrl from '../assets/albion-marque.svg';

	let {
		size = 20,
		decorative = true,
		alt = 'Albion'
	}: {
		size?: number;
		decorative?: boolean;
		alt?: string;
	} = $props();
</script>

<img
	src={albionMarqueUrl}
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
