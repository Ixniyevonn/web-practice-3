<script lang="ts">
	import "../app.css";

	let { children } = $props();
</script>

<svelte:head>
	<title>Долина Тихого Звона — платформер на Canvas</title>
	<meta
		name="description"
		content="Долина Тихого Звона — небольшой браузерный платформер: соберите три руны, преодолейте подъёмники, ветер и шипы, разбудите колокол. SvelteKit, TypeScript, Canvas 2D."
	/>
	<meta name="author" content="Савва Крупницкий" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="ru_RU" />
	<meta property="og:site_name" content="Долина Тихого Звона" />
	<meta property="og:title" content="Долина Тихого Звона — платформер на Canvas" />
	<meta
		property="og:description"
		content="Соберите три руны, преодолейте подъёмники, ветер и шипы, разбудите колокол в конце долины."
	/>
	<meta name="twitter:card" content="summary" />
</svelte:head>

{@render children()}
