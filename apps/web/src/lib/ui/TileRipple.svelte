<script lang="ts">
  // The pointer trail: tiles near the pointer brighten and fade. Mild by design.
  // Fine pointers only, off under reduced motion, and it stops drawing entirely
  // when nothing is lit.
  const TILE = 32;
  let canvas: HTMLCanvasElement;

  $effect(() => {
    if (!matchMedia('(pointer: fine)').matches) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const lit = new Map<string, number>();
    let frame = 0;
    let scale = 1;

    const resize = () => {
      scale = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(innerWidth * scale);
      canvas.height = Math.round(innerHeight * scale);
    };

    const draw = () => {
      frame = 0;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = getComputedStyle(canvas).color;
      for (const [key, level] of lit) {
        const [column = 0, row = 0] = key.split(',').map(Number);
        context.globalAlpha = level;
        context.fillRect(
          (column * TILE + 1) * scale,
          (row * TILE + 1) * scale,
          (TILE - 1) * scale,
          (TILE - 1) * scale,
        );
        const next = level * 0.94 - 0.0015;
        if (next <= 0.008) lit.delete(key);
        else lit.set(key, next);
      }
      context.globalAlpha = 1;
      if (lit.size > 0) frame = requestAnimationFrame(draw);
    };

    const move = (event: PointerEvent) => {
      const column = Math.floor(event.clientX / TILE);
      const row = Math.floor(event.clientY / TILE);
      for (let dx = -2; dx <= 2; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) {
          const distance = Math.hypot(dx, dy);
          if (distance > 2.3) continue;
          const key = `${column + dx},${row + dy}`;
          const level = 0.16 * (1 - distance / 2.6);
          if (level > (lit.get(key) ?? 0)) lit.set(key, level);
        }
      }
      if (!frame) frame = requestAnimationFrame(draw);
    };

    resize();
    addEventListener('resize', resize);
    addEventListener('pointermove', move, { passive: true });
    return () => {
      removeEventListener('resize', resize);
      removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
    };
  });
</script>

<canvas bind:this={canvas} class="ripple" aria-hidden="true"></canvas>

<style>
  .ripple {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    /* The fill colour is read from here, so it follows the theme. */
    color: var(--ripple);
  }
</style>
