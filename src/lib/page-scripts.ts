// Functions injected into the captured tab with browser.scripting.executeScript({ func }).
// Chrome sends each one's source text, so they can't use imports or anything outside
// their own body.

export interface AreaSelection {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The viewport size in CSS pixels, to scale the selection onto the captured image. */
  viewportWidth: number;
}

/** Lets the user drag out a rectangle. Resolves null on Escape or cancelAreaSelection. */
export function selectArea(): Promise<AreaSelection | null> {
  const ID = 'screen-tools-area-select';
  const CANCEL = 'screen-tools-cancel-area';
  // Cancels a picker left open, so its capture finishes instead of waiting forever.
  window.dispatchEvent(new Event(CANCEL));
  document.getElementById(ID)?.remove();

  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.id = ID;
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    // A shadow root keeps the page's CSS off the overlay.
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .layer { position: fixed; inset: 0; cursor: crosshair; user-select: none; }
        .dim { position: fixed; inset: 0; background: rgba(0,0,0,.4); }
        .box { position: fixed; display: none; outline: 1px dashed #fff; box-shadow: 0 0 0 100vmax rgba(0,0,0,.4); }
        .label, .hint { position: fixed; font: 500 12px/1 system-ui, sans-serif; color: #fff; background: rgba(0,0,0,.75); border-radius: 4px; padding: 4px 6px; pointer-events: none; }
        .hint { top: 16px; left: 50%; transform: translateX(-50%); font-size: 13px; padding: 6px 10px; }
        .label { display: none; }
      </style>
      <div class="layer"><div class="dim"></div><div class="box"></div><div class="label"></div><div class="hint">Drag to select an area · Esc to cancel</div></div>`;
    const layer = root.querySelector<HTMLElement>('.layer')!;
    const dim = root.querySelector<HTMLElement>('.dim')!;
    const box = root.querySelector<HTMLElement>('.box')!;
    const label = root.querySelector<HTMLElement>('.label')!;
    const hint = root.querySelector<HTMLElement>('.hint')!;

    let start: { x: number; y: number } | undefined;
    let rect = { x: 0, y: 0, width: 0, height: 0 };

    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener(CANCEL, onCancel);
      host.remove();
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };

    layer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      layer.setPointerCapture(event.pointerId);
      start = { x: event.clientX, y: event.clientY };
      rect = { ...start, width: 0, height: 0 };
    });
    layer.addEventListener('pointermove', (event) => {
      if (!start) return;
      const x = Math.max(0, Math.min(start.x, event.clientX));
      const y = Math.max(0, Math.min(start.y, event.clientY));
      rect = {
        x,
        y,
        width: Math.min(window.innerWidth, Math.max(start.x, event.clientX)) - x,
        height: Math.min(window.innerHeight, Math.max(start.y, event.clientY)) - y,
      };
      dim.style.display = 'none';
      hint.style.display = 'none';
      Object.assign(box.style, {
        display: 'block',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      label.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      Object.assign(label.style, {
        display: 'block',
        left: `${rect.x}px`,
        top: `${rect.y > 28 ? rect.y - 26 : rect.y + rect.height + 6}px`,
      });
    });
    layer.addEventListener('pointerup', () => {
      if (!start) return;
      start = undefined;
      // A click or tiny drag: start over rather than capture a sliver.
      if (rect.width < 5 || rect.height < 5) {
        box.style.display = label.style.display = 'none';
        dim.style.display = hint.style.display = 'block';
        return;
      }
      cleanup();
      // Wait until the overlay is gone from the screen before the capture.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => resolve({ ...rect, viewportWidth: window.innerWidth })),
      );
    });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener(CANCEL, onCancel);
    document.documentElement.append(host);
  });
}

/** Closes an open area picker, as if Escape was pressed. */
export function cancelAreaSelection(): void {
  window.dispatchEvent(new Event('screen-tools-cancel-area'));
}

/** Set on window between preparePage and restorePage. Injected scripts share one window per tab. */
interface FullPageState {
  screenToolsFullPage?: { stopped: boolean; onKey: (event: KeyboardEvent) => void };
}

export interface PageMetrics {
  scrollHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollX: number;
  scrollY: number;
}

/** Hides the scrollbar, turns off smooth scrolling and listens for Escape, then measures the page. */
export function preparePage(): PageMetrics {
  const state = window as Window & FullPageState;
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !state.screenToolsFullPage) return;
    event.preventDefault();
    event.stopPropagation();
    state.screenToolsFullPage.stopped = true;
  };
  state.screenToolsFullPage = { stopped: false, onKey };
  window.addEventListener('keydown', onKey, true);
  const style = document.createElement('style');
  style.id = 'screen-tools-full-page';
  style.textContent =
    'html { scrollbar-width: none !important; scroll-behavior: auto !important; } html::-webkit-scrollbar { display: none !important; }';
  document.documentElement.append(style);
  const { scrollingElement } = document;
  return {
    scrollHeight: Math.max(scrollingElement?.scrollHeight ?? 0, document.body?.scrollHeight ?? 0, window.innerHeight),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

export interface ScrollResult {
  /** Where the page actually landed. */
  y: number;
  /** Escape was pressed since preparePage. */
  stopped: boolean;
}

/** Scrolls and waits for the page to paint. */
export function scrollPage(y: number): Promise<ScrollResult> {
  window.scrollTo(0, y);
  const state = window as Window & FullPageState;
  return new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setTimeout(() => resolve({ y: window.scrollY, stopped: state.screenToolsFullPage?.stopped ?? false }), 100),
      ),
    ),
  );
}

/** Hides fixed and sticky elements so headers don't repeat down the stitched image. */
export function hideFixedElements(): void {
  for (const element of document.querySelectorAll<HTMLElement>('body *')) {
    const { position } = getComputedStyle(element);
    if (position !== 'fixed' && position !== 'sticky') continue;
    element.dataset.screenToolsVisibility = element.style.getPropertyValue('visibility');
    element.style.setProperty('visibility', 'hidden', 'important');
  }
}

/** Undoes preparePage and hideFixedElements and scrolls back. */
export function restorePage(x: number, y: number): void {
  const state = window as Window & FullPageState;
  if (state.screenToolsFullPage) window.removeEventListener('keydown', state.screenToolsFullPage.onKey, true);
  delete state.screenToolsFullPage;
  document.getElementById('screen-tools-full-page')?.remove();
  for (const element of document.querySelectorAll<HTMLElement>('[data-screen-tools-visibility]')) {
    const previous = element.dataset.screenToolsVisibility;
    if (previous) element.style.setProperty('visibility', previous);
    else element.style.removeProperty('visibility');
    delete element.dataset.screenToolsVisibility;
  }
  window.scrollTo(x, y);
}
