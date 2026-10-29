<script lang="ts">
	import { onMount, tick } from "svelte";
	import { base } from "$app/paths";
	import { Game } from "$lib/game/game";
	import { RUNE_META, RUNE_ORDER } from "$lib/game/level";
	import type { HudSnapshot, LoseReason, RunResult, VirtualAction } from "$lib/game/types";

	const initialHud: HudSnapshot = {
		phase: "loading",
		score: 0,
		bestScore: 0,
		bestTimeMs: 0,
		runes: 0,
		runesTotal: 3,
		shards: 0,
		shardsTotal: 11,
		elapsedMs: 0,
		muted: false,
		loseReason: null,
		autoPaused: false,
		portalActive: false,
		collectedRunes: [],
		hasDash: false,
		hasFire: false,
		hasLightness: false,
		dashCooldownMs: 0,
		fireCooldownMs: 0,
		checkpoints: 0,
		checkpointsTotal: 6,
		checkpointLabel: null,
		canRespawn: false
	};

	let hud = $state<HudSnapshot>({ ...initialHud });
	let result = $state<RunResult | null>(null);
	let toast = $state("");
	let liveMessage = $state("Загрузка игры.");
	let stage: HTMLDivElement | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let game: Game | null = null;
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	const timeLabel = $derived(formatTime(hud.elapsedMs));
	const scoreLabel = $derived(formatScore(hud.score));
	const bestScoreLabel = $derived(hud.bestScore > 0 ? formatScore(hud.bestScore) : "—");
	const bestTimeLabel = $derived(hud.bestTimeMs > 0 ? formatTime(hud.bestTimeMs) : "—");
	const resultReason = $derived(result?.reason ?? hud.loseReason);
	const resultTitle = $derived(
		hud.phase === "won" ? "Колокол пробуждён" : loseTitle(resultReason)
	);
	const resultLead = $derived(
		hud.phase === "won"
			? "Три руны сложились в печать, и колокол пробудился. Долина снова дышит."
			: hud.canRespawn
				? `${reasonText(resultReason)} Вернитесь к очагу «${hud.checkpointLabel}» — руны и эхо останутся с вами.`
				: `${reasonText(resultReason)} Очаг ещё не зажжён, путь придётся начать сначала.`
	);

	function loseTitle(reason: LoseReason): string {
		if (reason === "guardian") return "Страж не пропустил";
		if (reason === "mist") return "Туман забрал вас";
		if (reason === "fall") return "Вы сорвались";
		if (reason === "spikes") return "Шипы не пропустили";
		return "Поход прерван";
	}

	function formatTime(ms: number): string {
		const total = Math.max(0, Math.floor(ms));
		const minutes = Math.floor(total / 60000);
		const seconds = Math.floor((total % 60000) / 1000);
		const tenths = Math.floor((total % 1000) / 100);
		return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
	}

	function formatScore(value: number): string {
		return String(Math.max(0, Math.round(value))).padStart(4, "0");
	}

	function formatCooldown(ms: number): string {
		return (Math.max(0, ms) / 1000).toFixed(1);
	}

	function reasonText(reason: LoseReason): string {
		if (reason === "fall") return "Вы сорвались в туман.";
		if (reason === "mist") return "Проклятый туман забрал вас раньше, чем руны сложились в печать.";
		if (reason === "guardian") return "Страж-драконид не пропустил картографа.";
		if (reason === "spikes") return "Проклятые шипы не пропустили картографа.";
		return "Поход прерван. Попробуйте ещё раз.";
	}

	function handleHud(snapshot: HudSnapshot): void {
		const previous = hud.phase;
		hud = snapshot;
		if (snapshot.phase === previous) return;

		if (snapshot.phase === "idle") {
			result = null;
			liveMessage = "Игра готова. Нажмите «Начать путь».";
			focusStart();
		} else if (snapshot.phase === "running") {
			result = null;
			liveMessage = "Игра началась. Соберите три руны и разбудите колокол.";
			focusStage();
		} else if (snapshot.phase === "paused") {
			liveMessage = snapshot.autoPaused
				? "Игра приостановлена: вкладка была скрыта."
				: "Игра на паузе.";
			if (typeof document !== "undefined" && !document.hidden) focusPause();
		} else if (snapshot.phase === "won") {
			liveMessage = "Победа. Колокол пробуждён.";
			focusEnd();
		} else if (snapshot.phase === "lost") {
			liveMessage = `Поражение. ${reasonText(snapshot.loseReason)}${
				snapshot.canRespawn
					? ` Можно вернуться к очагу «${snapshot.checkpointLabel}».`
					: " Очаг ещё не зажжён."
			}`;
			focusEnd();
		}
	}

	function handleResult(next: RunResult): void {
		result = next;
	}

	function handleToast(message: string): void {
		toast = message;
		liveMessage = message;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			toast = "";
			toastTimer = null;
		}, 2800);
	}

	function blurEvent(event?: Event): void {
		const target = event?.currentTarget;
		if (target instanceof HTMLElement) target.blur();
	}

	function startGame(event?: Event): void {
		blurEvent(event);
		result = null;
		game?.start();
		focusStage();
	}

	function resumeGame(event?: Event): void {
		blurEvent(event);
		game?.resume();
		focusStage();
	}

	function restartGame(event?: Event): void {
		blurEvent(event);
		result = null;
		game?.restart();
		focusStage();
	}

	function respawnGame(event?: Event): void {
		blurEvent(event);
		result = null;
		game?.respawnAtCheckpoint();
		focusStage();
	}

	function togglePause(event?: Event): void {
		blurEvent(event);
		game?.togglePause();
		if (hud.phase === "running") focusStage();
		else if (hud.phase === "paused") focusPause();
	}

	function toggleMute(event?: Event): void {
		blurEvent(event);
		game?.toggleMute();
		if (hud.phase === "running") focusStage();
		else if (hud.phase === "paused") focusPause();
	}

	function press(action: VirtualAction, event: PointerEvent): void {
		event.preventDefault();
		const element = event.currentTarget;
		if (element instanceof HTMLElement) {
			try {
				element.setPointerCapture(event.pointerId);
			} catch {
				// Synthetic pointer events may not own a pointer; real touches do.
			}
		}
		game?.setVirtual(action, true);
	}

	function release(action: VirtualAction, event: PointerEvent): void {
		event.preventDefault();
		game?.setVirtual(action, false);
	}

	function isRuneCollected(runeId: (typeof RUNE_ORDER)[number]): boolean {
		return hud.collectedRunes.includes(runeId);
	}

	async function focusStage(): Promise<void> {
		await tick();
		stage?.focus();
	}

	async function focusStart(): Promise<void> {
		await tick();
		stage?.querySelector<HTMLElement>("[data-focus='start']")?.focus();
	}

	async function focusPause(): Promise<void> {
		await tick();
		stage?.querySelector<HTMLElement>("[data-focus='resume']")?.focus();
	}

	async function focusEnd(): Promise<void> {
		await tick();
		stage?.querySelector<HTMLElement>("[data-focus='end-primary']")?.focus();
	}

	onMount(() => {
		if (!canvas) return;
		const instance = new Game(canvas, {
			onHud: handleHud,
			onResult: handleResult,
			onToast: handleToast
		});
		game = instance;
		if (new URLSearchParams(window.location.search).has("debug")) {
			// Local debugging hook: open /?debug=1 to inspect the game from DevTools.
			(window as Window & { __silentTollGame?: Game }).__silentTollGame = instance;
		}
		void instance.init();

		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.repeat) return;
			if (
				event.target instanceof HTMLElement &&
				event.target.closest("input, textarea, select, [contenteditable='true']")
			) {
				return;
			}
			if (event.code === "KeyP" || event.code === "Escape") {
				if (hud.phase === "running" || hud.phase === "paused") {
					event.preventDefault();
					togglePause();
				}
			} else if (event.code === "KeyR") {
				if (hud.phase !== "loading") {
					event.preventDefault();
					restartGame();
				}
			} else if (
				hud.phase === "lost" &&
				hud.canRespawn &&
				(event.code === "Enter" ||
					event.code === "NumpadEnter" ||
					event.code === "Space")
			) {
				event.preventDefault();
				respawnGame();
			}
		};

		const onResize = (): void => instance.resize();
		const onVisibility = (): void => {
			if (typeof document === "undefined") return;
			if (!document.hidden && hud.phase === "paused" && hud.autoPaused) focusPause();
		};

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("resize", onResize);
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("resize", onResize);
			document.removeEventListener("visibilitychange", onVisibility);
			if (toastTimer) clearTimeout(toastTimer);
			instance.destroy();
			game = null;
		};
	});
</script>

<main class="page">
	<div class="stage-shell">
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="stage"
			bind:this={stage}
			tabindex="0"
			role="application"
			aria-roledescription="игра"
			aria-label="Игровое поле «Долина Тихого Звона». Управление: стрелки или A и D — движение, Space или W — прыжок."
		>
			<canvas bind:this={canvas} class="game-canvas" width="960" height="540" aria-hidden="true"
			></canvas>

			<div class="hud" aria-label="Состояние игры">
				<div class="hud-left">
					<div
						class="rune-status"
						aria-label={`Собрано рун: ${hud.runes} из ${hud.runesTotal}`}
					>
						{#each RUNE_ORDER as runeId}
							{@const meta = RUNE_META[runeId]}
							<span
								class="rune-chip"
								class:is-collected={isRuneCollected(runeId)}
								title={meta.label}
							>
								<img src={`${base}/${meta.image}`} alt="" width="18" height="18" />
							</span>
						{/each}
						<span class="hud-count mono">{hud.runes}/{hud.runesTotal}</span>
					</div>
					<div
						class="checkpoint-chip"
						class:is-empty={hud.checkpoints === 0}
						title={hud.checkpointLabel ? `Очаг «${hud.checkpointLabel}»` : "Очаг ещё не зажжён"}
					>
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<path
								d="M8 1.4c2 2.4 3.2 3.9 3.2 5.7a3.2 3.2 0 0 1-6.4 0c0-1.8 1.2-3.3 3.2-5.7z"
								fill="currentColor"
							/>
							<path d="M3.2 11.7h9.6l1 2.6H2.2z" fill="currentColor" opacity="0.6" />
						</svg>
						<span class="mono">{hud.checkpoints}/{hud.checkpointsTotal}</span>
					</div>
				</div>

				<div class="hud-stats">
					<div class="stat">
						<span class="stat-label mono">Счёт</span>
						<strong class="stat-value">{scoreLabel}</strong>
					</div>
					<div class="stat">
						<span class="stat-label mono">Время</span>
						<strong class="stat-value">{timeLabel}</strong>
					</div>
					<div class="stat stat-best">
						<span class="stat-label mono">Рекорд</span>
						<strong class="stat-value">{bestScoreLabel}</strong>
					</div>
					<div class="stat stat-shards">
						<span class="stat-label mono">Эхо</span>
						<strong class="stat-value">{hud.shards}/{hud.shardsTotal}</strong>
					</div>
				</div>

				<div class="hud-actions">
					<button
						class="icon-btn"
						type="button"
						onclick={togglePause}
						disabled={hud.phase === "loading" ||
							hud.phase === "idle" ||
							hud.phase === "won" ||
							hud.phase === "lost"}
						aria-label={hud.phase === "paused" ? "Продолжить" : "Пауза"}
						title={hud.phase === "paused" ? "Продолжить (P)" : "Пауза (P)"}
					>
						{#if hud.phase === "paused"}
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="M7 4l9 6-9 6z" fill="currentColor" />
							</svg>
						{:else}
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<rect x="5" y="4" width="3" height="12" fill="currentColor" />
								<rect x="12" y="4" width="3" height="12" fill="currentColor" />
							</svg>
						{/if}
					</button>
					<button
						class="icon-btn"
						type="button"
						onclick={restartGame}
						disabled={hud.phase === "loading"}
						aria-label="Начать заново"
						title="Заново (R)"
					>
						<svg viewBox="0 0 20 20" aria-hidden="true">
							<path
								d="M15.5 7.2A6 6 0 1 0 16 11"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="square"
							/>
							<path d="M15.5 3.6v4.2h-4.2" fill="none" stroke="currentColor" stroke-width="1.6" />
						</svg>
					</button>
					<button
						class="icon-btn"
						type="button"
						onclick={toggleMute}
						disabled={hud.phase === "loading"}
						aria-label={hud.muted ? "Включить звук" : "Выключить звук"}
						aria-pressed={hud.muted}
						title="Звук"
					>
						{#if hud.muted}
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="M4 8h3l4-3.5v11L7 12H4z" fill="currentColor" />
								<path d="M13 8l4 4m0-4l-4 4" fill="none" stroke="currentColor" stroke-width="1.5" />
							</svg>
						{:else}
							<svg viewBox="0 0 20 20" aria-hidden="true">
								<path d="M4 8h3l4-3.5v11L7 12H4z" fill="currentColor" />
								<path
									d="M13.5 7a4.4 4.4 0 0 1 0 6M15.5 5a7 7 0 0 1 0 10"
									fill="none"
									stroke="currentColor"
									stroke-width="1.4"
									stroke-linecap="round"
								/>
							</svg>
						{/if}
					</button>
				</div>
			</div>

			{#if hud.phase === "running" || hud.phase === "paused"}
				<div class="spellbar" aria-label="Способности">
					<div
						class="spell-slot"
						class:is-locked={!hud.hasDash}
						class:is-cooling={hud.dashCooldownMs > 0}
					>
						<img src={`${base}/${RUNE_META.path.image}`} alt="" width="22" height="22" />
						<div class="spell-text">
							<span class="spell-key mono">Shift</span>
							<span class="spell-name">Рывок</span>
						</div>
						{#if hud.dashCooldownMs > 0}
							<span class="spell-cd mono">{formatCooldown(hud.dashCooldownMs)}</span>
						{/if}
					</div>
					<div
						class="spell-slot"
						class:is-locked={!hud.hasFire}
						class:is-cooling={hud.fireCooldownMs > 0}
					>
						<img src={`${base}/${RUNE_META.fire.image}`} alt="" width="22" height="22" />
						<div class="spell-text">
							<span class="spell-key mono">F</span>
							<span class="spell-name">Пламя</span>
						</div>
						{#if hud.fireCooldownMs > 0}
							<span class="spell-cd mono">{formatCooldown(hud.fireCooldownMs)}</span>
						{/if}
					</div>
					<div class="spell-slot" class:is-locked={!hud.hasLightness}>
						<img src={`${base}/${RUNE_META.lightness.image}`} alt="" width="22" height="22" />
						<div class="spell-text">
							<span class="spell-key mono">пассив</span>
							<span class="spell-name">Лёгкость</span>
						</div>
					</div>
				</div>
			{/if}

			{#if hud.phase === "loading"}
				<div class="overlay overlay-loading">
					<div class="loader-ring" aria-hidden="true"></div>
					<p class="mono">Пробуждаем долину…</p>
				</div>
			{:else if hud.phase === "idle"}
				<div class="overlay overlay-start">
					<div class="panel start-panel">
						<p class="eyebrow mono">Три руны · один колокол</p>
						<h1>Долина Тихого Звона</h1>
						<p class="lead">
							Три руны потеряны в долине. <strong>Путь</strong> даст рывок, <strong>Огонь</strong> —
							пламя, <strong>Лёгкость</strong> — медленное падение. Зажигайте очаги и разбудите колокол.
						</p>
						<div class="rune-row" aria-hidden="true">
							{#each RUNE_ORDER as runeId}
								{@const meta = RUNE_META[runeId]}
								<span class="start-rune">
									<img src={`${base}/${meta.image}`} alt="" width="34" height="34" />
									<span class="mono">{meta.label}</span>
								</span>
							{/each}
						</div>
						<div class="controls-grid">
							<div>
								<kbd>←</kbd><kbd>→</kbd><span class="controls-or">или</span><kbd>A</kbd><kbd>D</kbd>
								<span>движение</span>
							</div>
							<div><kbd>Space</kbd><span class="controls-or">или</span><kbd>W</kbd><span>прыжок</span></div>
							<div><kbd>Shift</kbd><span>рывок</span></div>
							<div><kbd>F</kbd><span>пламя</span></div>
							<div><kbd>P</kbd><span>пауза</span></div>
							<div><kbd>R</kbd><span>заново</span></div>
						</div>
						<button class="btn btn-primary" type="button" onclick={startGame} data-focus="start">
							Начать путь
						</button>
						<p class="hint hint-desktop mono">Стрелки/A–D — движение, Space/W — прыжок, Shift — рывок, F — пламя. Звук — в шапке.</p>
						<p class="hint hint-touch mono">Кнопки — под полем. Способности открываются с рунами.</p>
					</div>
				</div>
			{:else if hud.phase === "paused"}
				<div class="overlay overlay-pause">
					<div class="panel pause-panel">
						<p class="eyebrow mono">{hud.autoPaused ? "Вкладка была скрыта" : "Пауза"}</p>
						<h2>Путь приостановлен</h2>
						<p class="lead">
							Руны {hud.runes}/{hud.runesTotal} · Эхо {hud.shards}/{hud.shardsTotal} · Счёт {hud.score}
						</p>
						<div class="button-row">
							<button class="btn btn-primary" type="button" data-focus="resume" onclick={resumeGame}>
								Продолжить
							</button>
							<button class="btn" type="button" onclick={restartGame}>Заново</button>
						</div>
					</div>
				</div>
			{:else if hud.phase === "won" || hud.phase === "lost"}
				<div
					class="overlay overlay-end"
					class:overlay-won={hud.phase === "won"}
					class:overlay-lost={hud.phase === "lost"}
				>
					<div class="panel end-panel">
						<p class="eyebrow mono">{hud.phase === "won" ? "Долина услышала" : "Поход прерван"}</p>
						<h2>{resultTitle}</h2>
						<p class="lead">{resultLead}</p>
						{#if result}
							<dl class="score-table">
								<div><dt>Руны</dt><dd>+{result.breakdown.runes}</dd></div>
								<div><dt>Эхо</dt><dd>+{result.breakdown.shards}</dd></div>
								<div><dt>Финиш</dt><dd>+{result.breakdown.finish}</dd></div>
								<div><dt>Время</dt><dd>+{result.breakdown.time}</dd></div>
							</dl>
							<div class="total-row">
								<span class="mono">Итог</span>
								<strong>{result.score}</strong>
							</div>
							{#if result.newBestScore}
								<p class="record mono">Новый рекорд</p>
							{/if}
							<p class="meta mono">
								Лучший счёт: {bestScoreLabel} · Лучшее время: {bestTimeLabel}
							</p>
						{/if}
						<div class="button-row">
							<button
								class="btn btn-primary"
								type="button"
								data-focus="end-primary"
								onclick={hud.phase === "lost" && hud.canRespawn ? respawnGame : restartGame}
							>
								{hud.phase === "lost" && hud.canRespawn ? "Вернуться к очагу" : "Заново"}
							</button>
							{#if hud.phase === "lost" && hud.canRespawn}
								<button class="btn" type="button" onclick={restartGame}>Заново</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			{#if toast && hud.phase === "running"}
				<p class="toast mono">{toast}</p>
			{/if}
		</div>

		<div class="touch-controls" aria-label="Экранное управление">
			<div class="touch-group">
				<button
					class="touch-btn"
					type="button"
					aria-label="Влево"
					disabled={hud.phase !== "running"}
					onpointerdown={(event) => press("left", event)}
					onpointerup={(event) => release("left", event)}
					onpointercancel={(event) => release("left", event)}
					onpointerleave={(event) => release("left", event)}
					oncontextmenu={(event) => event.preventDefault()}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" />
					</svg>
				</button>
				<button
					class="touch-btn"
					type="button"
					aria-label="Вправо"
					disabled={hud.phase !== "running"}
					onpointerdown={(event) => press("right", event)}
					onpointerup={(event) => release("right", event)}
					onpointercancel={(event) => release("right", event)}
					onpointerleave={(event) => release("right", event)}
					oncontextmenu={(event) => event.preventDefault()}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" />
					</svg>
				</button>
			</div>
			<div class="touch-group touch-actions">
				<button
					class="touch-btn touch-spell"
					type="button"
					aria-label="Рывок"
					title="Рывок"
					disabled={hud.phase !== "running" || !hud.hasDash || hud.dashCooldownMs > 0}
					onpointerdown={(event) => press("dash", event)}
					onpointerup={(event) => release("dash", event)}
					onpointercancel={(event) => release("dash", event)}
					onpointerleave={(event) => release("dash", event)}
					oncontextmenu={(event) => event.preventDefault()}
				>
					<img src={`${base}/${RUNE_META.path.image}`} alt="" width="28" height="28" />
				</button>
				<button
					class="touch-btn touch-spell"
					type="button"
					aria-label="Пламя"
					title="Пламя"
					disabled={hud.phase !== "running" || !hud.hasFire || hud.fireCooldownMs > 0}
					onpointerdown={(event) => press("fire", event)}
					onpointerup={(event) => release("fire", event)}
					onpointercancel={(event) => release("fire", event)}
					onpointerleave={(event) => release("fire", event)}
					oncontextmenu={(event) => event.preventDefault()}
				>
					<img src={`${base}/${RUNE_META.fire.image}`} alt="" width="28" height="28" />
				</button>
			</div>
			<button
				class="touch-btn touch-jump"
				type="button"
				aria-label="Прыжок"
				disabled={hud.phase !== "running"}
				onpointerdown={(event) => press("jump", event)}
				onpointerup={(event) => release("jump", event)}
				onpointercancel={(event) => release("jump", event)}
				onpointerleave={(event) => release("jump", event)}
				oncontextmenu={(event) => event.preventDefault()}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M12 19V6m0 0l-5 5m5-5l5 5"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					/>
				</svg>
			</button>
		</div>
	</div>

	<p class="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</p>
</main>

<style>
	.page {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100svh;
		overflow: hidden;
	}

	.eyebrow {
		color: var(--gold);
		font-size: 0.54rem;
		letter-spacing: 0.18em;
		line-height: 1.2;
	}

	.stage-shell {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.stage {
		position: relative;
		isolation: isolate;
		width: min(100vw, calc(100svh * 16 / 9));
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background: transparent;
		touch-action: none;
		user-select: none;
	}

	.stage:focus-visible {
		outline: 2px solid var(--gold-bright);
		outline-offset: 4px;
	}

	.game-canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.hud {
		position: absolute;
		inset: 0 0 auto;
		z-index: 6;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
		background: linear-gradient(180deg, rgba(8, 6, 4, 0.88), rgba(8, 6, 4, 0));
		pointer-events: none;
	}

	.hud-left {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.rune-status {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.rune-chip {
		display: grid;
		place-items: center;
		width: 21px;
		height: 21px;
		opacity: 0.28;
		filter: grayscale(1);
		transition:
			opacity var(--dur-fast) var(--ease-out),
			filter var(--dur-fast) var(--ease-out),
			transform var(--dur-fast) var(--ease-out);
	}

	.rune-chip.is-collected {
		opacity: 1;
		filter: drop-shadow(0 0 6px rgba(228, 180, 114, 0.4));
		transform: translateY(-1px);
	}

	.rune-chip img {
		display: block;
		width: 18px;
		height: 18px;
	}

	.hud-count {
		margin-left: 3px;
		color: var(--muted);
		font-size: 0.52rem;
	}

	.checkpoint-chip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-left: 9px;
		border-left: 1px solid var(--line);
		color: var(--gold);
		font-size: 0.52rem;
		transition: color var(--dur-fast) var(--ease-out);
	}

	.checkpoint-chip svg {
		width: 12px;
		height: 12px;
		filter: drop-shadow(0 0 6px rgba(255, 178, 74, 0.5));
	}

	.checkpoint-chip span {
		color: var(--muted);
	}

	.checkpoint-chip.is-empty {
		color: rgba(228, 180, 114, 0.35);
	}

	.checkpoint-chip.is-empty svg {
		filter: none;
	}

	.hud-stats {
		display: flex;
		align-items: flex-start;
		gap: clamp(8px, 1.4vw, 18px);
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		min-width: 44px;
	}

	.stat-label {
		color: var(--faint);
		font-size: 0.46rem;
		letter-spacing: 0.12em;
	}

	.stat-value {
		color: var(--ink);
		font-family: var(--f-mono);
		font-size: 0.75rem;
		font-weight: 400;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}

	.stat-best .stat-value {
		color: var(--gold);
	}

	.hud-actions {
		display: flex;
		gap: 5px;
		pointer-events: auto;
	}

	.icon-btn {
		display: grid;
		place-items: center;
		width: 31px;
		height: 31px;
		padding: 0;
		border: 1px solid var(--line);
		background: rgba(8, 6, 4, 0.55);
		color: var(--gold);
		cursor: pointer;
		transition:
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out),
			background-color var(--dur-fast) var(--ease-out);
	}

	.icon-btn:hover:not(:disabled) {
		border-color: var(--gold-bright);
		background: rgba(228, 180, 114, 0.12);
		color: var(--gold-bright);
	}

	.icon-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.icon-btn svg {
		width: 17px;
		height: 17px;
	}

	.spellbar {
		position: absolute;
		top: 54px;
		left: 12px;
		z-index: 4;
		display: flex;
		gap: 5px;
		pointer-events: none;
	}

	.spell-slot {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 34px;
		padding: 3px 8px;
		border: 1px solid var(--line);
		background: rgba(8, 6, 4, 0.58);
		transition:
			opacity var(--dur-fast) var(--ease-out),
			filter var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}

	.spell-slot img {
		display: block;
		width: 22px;
		height: 22px;
	}

	.spell-slot.is-locked {
		opacity: 0.3;
		filter: grayscale(1);
	}

	.spell-slot.is-cooling {
		opacity: 0.55;
	}

	.spell-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		line-height: 1.1;
	}

	.spell-key {
		color: var(--gold);
		font-size: 0.45rem;
		letter-spacing: 0.1em;
	}

	.spell-name {
		color: var(--muted);
		font-size: 0.58rem;
		line-height: 1.1;
	}

	.spell-cd {
		color: var(--gold-bright);
		font-size: 0.48rem;
		font-variant-numeric: tabular-nums;
	}

	.overlay {
		position: absolute;
		inset: 0;
		z-index: 5;
		display: grid;
		place-items: center;
		padding: 48px clamp(10px, 2.5vw, 22px) clamp(10px, 2.5vw, 22px);
		background: radial-gradient(
			ellipse 70% 76% at 50% 50%,
			rgba(8, 6, 4, 0.58) 0%,
			rgba(8, 6, 4, 0.32) 58%,
			rgba(8, 6, 4, 0) 100%
		);
	}

	.overlay-loading {
		gap: 16px;
		background: rgba(8, 6, 4, 0.86);
	}

	.overlay-loading p {
		color: var(--gold);
		font-size: 0.56rem;
	}

	.loader-ring {
		width: 54px;
		height: 54px;
		border: 1px solid var(--line);
		border-top-color: var(--gold-bright);
		border-radius: 50%;
		box-shadow: 0 0 20px rgba(228, 180, 114, 0.15);
		animation: spin 1.2s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.panel {
		position: relative;
		width: min(550px, 100%);
		max-height: 100%;
		overflow: auto;
		padding: clamp(18px, 3.6vw, 34px);
		border: 1px solid var(--line-strong);
		background:
			linear-gradient(180deg, rgba(23, 17, 11, 0.96), rgba(9, 7, 5, 0.97)),
			var(--panel);
		box-shadow:
			0 22px 60px rgba(0, 0, 0, 0.62),
			inset 0 0 0 1px rgba(228, 180, 114, 0.08);
		overscroll-behavior: contain;
		touch-action: pan-y;
	}

	.panel::before,
	.panel::after {
		content: "";
		position: absolute;
		width: 18px;
		height: 18px;
		pointer-events: none;
	}

	.panel::before {
		top: 6px;
		left: 6px;
		border-top: 1px solid var(--gold);
		border-left: 1px solid var(--gold);
		opacity: 0.6;
	}

	.panel::after {
		right: 6px;
		bottom: 6px;
		border-right: 1px solid var(--gold);
		border-bottom: 1px solid var(--gold);
		opacity: 0.6;
	}

	.panel h1,
	.panel h2 {
		margin: 6px 0 10px;
		color: var(--ink);
		font-family: var(--f-serif);
		font-size: clamp(1.5rem, 3.4vw, 2.15rem);
		font-weight: 400;
		line-height: 1.05;
	}

	.lead {
		max-width: 52ch;
		color: var(--muted);
		font-size: clamp(0.82rem, 1.2vw, 0.92rem);
		line-height: 1.55;
	}

	.lead strong {
		color: var(--gold-bright);
		font-weight: 400;
	}

	.rune-row {
		display: flex;
		gap: 18px;
		margin: 16px 0 14px;
	}

	.start-rune {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted);
	}

	.start-rune img {
		width: 32px;
		height: 32px;
		filter: drop-shadow(0 0 8px rgba(228, 180, 114, 0.26));
	}

	.start-rune .mono {
		font-size: 0.5rem;
	}

	.controls-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 7px 14px;
		margin-bottom: 18px;
		padding: 12px 0;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}

	.controls-grid > div {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px;
		color: var(--muted);
		font-size: 0.7rem;
	}

	.controls-or {
		color: var(--faint);
		font-size: 0.62rem;
	}

	kbd {
		display: inline-block;
		min-width: 18px;
		padding: 1px 5px;
		border: 1px solid var(--line);
		background: rgba(228, 180, 114, 0.06);
		color: var(--gold);
		font-family: var(--f-mono);
		font-size: 0.57rem;
		line-height: 1.5;
		text-align: center;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		padding: 0.65rem 1.25rem;
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--gold);
		font-family: var(--f-mono);
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			color var(--dur-fast) var(--ease-out),
			background-color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}

	.btn:hover {
		border-color: var(--gold-bright);
		color: var(--gold-bright);
	}

	.btn-primary {
		border-color: var(--gold);
		background: var(--gold);
		color: #100b06;
	}

	.btn-primary:hover {
		border-color: var(--gold-bright);
		background: var(--gold-bright);
		color: #0b0805;
	}

	.button-row {
		display: flex;
		flex-wrap: wrap;
		gap: 9px;
		margin-top: 18px;
	}

	.hint {
		margin-top: 12px;
		color: var(--faint);
		font-size: 0.46rem;
		line-height: 1.5;
	}

	.pause-panel {
		width: min(430px, 100%);
	}

	.end-panel {
		width: min(500px, 100%);
	}

	.score-table {
		display: grid;
		gap: 4px;
		margin: 16px 0 10px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}

	.score-table > div {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		color: var(--muted);
		font-size: 0.76rem;
	}

	.score-table dt {
		font-family: var(--f-mono);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.score-table dd {
		margin: 0;
		color: var(--gold);
		font-family: var(--f-mono);
		font-variant-numeric: tabular-nums;
	}

	.total-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 4px;
	}

	.total-row span {
		color: var(--muted);
	}

	.total-row strong {
		color: var(--gold-bright);
		font-family: var(--f-serif);
		font-size: 1.8rem;
		font-weight: 400;
		line-height: 1;
	}

	.record {
		margin: 8px 0 0;
		color: var(--gold-bright);
		font-size: 0.56rem;
		letter-spacing: 0.16em;
	}

	.meta {
		margin: 8px 0 18px;
		color: var(--faint);
		font-size: 0.48rem;
		line-height: 1.6;
	}

	.toast {
		position: absolute;
		top: 56px;
		left: 50%;
		z-index: 7;
		max-width: calc(100% - 24px);
		margin: 0;
		padding: 6px 12px;
		border: 1px solid var(--line-strong);
		background: rgba(12, 9, 6, 0.92);
		color: var(--gold-bright);
		font-size: 0.54rem;
		line-height: 1.4;
		text-align: center;
		transform: translateX(-50%);
		pointer-events: none;
		animation: toast-in 180ms var(--ease-out);
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translate(-50%, -4px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	.touch-controls {
		display: none;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: min(calc(100vw - 20px), 620px);
		padding: 0 2px;
		pointer-events: none;
	}

	.touch-group {
		display: flex;
		gap: 8px;
		pointer-events: auto;
	}

	.touch-btn {
		display: grid;
		place-items: center;
		width: 54px;
		height: 54px;
		padding: 0;
		border: 1px solid rgba(228, 180, 114, 0.45);
		border-radius: 50%;
		background: rgba(8, 6, 4, 0.6);
		color: var(--gold-bright);
		backdrop-filter: blur(4px);
		touch-action: none;
		pointer-events: auto;
	}

	.touch-btn:active:not(:disabled) {
		background: rgba(228, 180, 114, 0.22);
	}

	.touch-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.touch-btn svg {
		width: 25px;
		height: 25px;
	}

	.touch-jump {
		width: 62px;
		height: 62px;
		border-color: var(--gold);
	}

	.touch-actions {
		gap: 7px;
	}

	.touch-spell {
		width: 50px;
		height: 50px;
		border-color: rgba(109, 148, 255, 0.55);
	}

	.touch-spell img {
		display: block;
		width: 27px;
		height: 27px;
	}

	.touch-spell:disabled img {
		filter: grayscale(1);
	}

	.hint-touch {
		display: none;
	}

	@media (hover: none), (pointer: coarse), (max-width: 760px) {
		.touch-controls {
			display: flex;
		}

		.stage-shell {
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 10px;
		}

		.stage {
			width: min(100vw, calc((100svh - 84px) * 16 / 9));
		}

		.overlay {
			padding-top: 44px;
		}

		.spellbar {
			display: none;
		}

		.hud {
			padding: 8px 9px;
		}

		.hud-left {
			gap: 7px;
		}

		.hud-count,
		.checkpoint-chip,
		.stat-best,
		.stat-shards {
			display: none;
		}

		.hud-stats {
			gap: 11px;
		}

		.stat {
			min-width: 40px;
		}

		.stat-value {
			font-size: 0.68rem;
		}

		.icon-btn {
			width: 29px;
			height: 29px;
		}

		.icon-btn svg {
			width: 15px;
			height: 15px;
		}

		.toast {
			top: 48px;
			font-size: 0.48rem;
		}

		.rune-row,
		.controls-grid,
		.hint-desktop {
			display: none;
		}

		.hint-touch {
			display: block;
		}

		.start-panel .lead {
			font-size: 0.78rem;
		}

		.panel {
			padding: 14px 16px 16px;
		}

		.panel h1,
		.panel h2 {
			margin: 4px 0 7px;
			font-size: 1.35rem;
		}

		.score-table {
			display: none;
		}

		.end-panel .eyebrow,
		.end-panel .lead {
			display: none;
		}

		.end-panel h2 {
			margin-top: 0;
			font-size: 1.2rem;
		}

		.end-panel .meta {
			margin: 4px 0 10px;
		}

		.end-panel .record {
			margin-top: 4px;
		}

		.end-panel .btn {
			min-height: 36px;
		}

		.meta {
			margin-bottom: 12px;
		}
	}

	@media (max-width: 600px) {
		.rune-chip {
			width: 18px;
			height: 18px;
		}

		.rune-chip img {
			width: 15px;
			height: 15px;
		}
	}

	@media (max-width: 380px) {
		.touch-btn {
			width: 46px;
			height: 46px;
		}

		.touch-btn svg {
			width: 21px;
			height: 21px;
		}

		.touch-spell {
			width: 44px;
			height: 44px;
		}

		.touch-spell img {
			width: 23px;
			height: 23px;
		}

		.touch-jump {
			width: 54px;
			height: 54px;
		}
	}

	@media (max-width: 760px) and (orientation: portrait) {
		.hint-touch {
			display: none;
		}
	}
</style>
