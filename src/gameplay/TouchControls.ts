import { Player } from "../Player";

/** Callbacks the game wires up for the on-screen action buttons */
export interface TouchControlHandlers {
  onBreakStart(): void;
  onBreakStop(): void;
  onPlaceStart(): void;
  onPlaceStop(): void;
  /** Quick tap on the world: sit on a targeted chair / stand up */
  onUse(): void;
  /** Toggle first/third person */
  onViewToggle(): void;
  onPause(): void;
  onFullscreen(): void;
}

type Dir = "up" | "down" | "left" | "right";

/**
 * On-screen controls for touch devices: a Minecraft-style D-pad on the left,
 * a drag-anywhere look surface, and action buttons on the right. All input
 * goes through the same `Player`/`Game` methods the keyboard and mouse use.
 */
export class TouchControls {
  /** Whether the controls should be shown and their input accepted */
  enabled = false;

  /** Fingers currently on the D-pad, keyed by pointer id to their position */
  private readonly dpadPointers = new Map<number, { x: number; y: number }>();
  /** Pointer currently dragging to look, if any */
  private lookPointer: number | null = null;
  private lookX = 0;
  private lookY = 0;
  /** Start position/time of the current look pointer, for tap detection */
  private lookStartX = 0;
  private lookStartY = 0;
  private lookStartTime = 0;
  private lookMoved = false;
  /**
   * Pointers that began on an action button, keyed to their start position.
   * They only take over the look once dragged past a small threshold, so a
   * tap on a button does not steal the camera.
   */
  private readonly lookCandidates = new Map<number, { x: number; y: number }>();
  /** Sprint is a toggle on touch */
  private sprinting = false;

  private readonly root: HTMLElement;

  constructor(
    private readonly player: Player,
    private readonly handlers: TouchControlHandlers
  ) {
    const root = document.getElementById("touch-controls");
    if (!root) {
      throw new Error("Touch control elements are missing from the page");
    }
    this.root = root;

    this.setupDpad();
    this.setupLook();
    this.setupButtons();
    this.setupHotbar();
    this.setVisible(false);
  }

  /** Shows/hides the controls and drops any held input */
  setVisible(visible: boolean) {
    this.enabled = visible;
    this.root.style.display = visible ? "block" : "none";
    if (!visible) this.reset();
  }

  private reset() {
    this.dpadPointers.clear();
    this.lookCandidates.clear();
    this.lookPointer = null;
    this.sprinting = false;
    this.player.clearTouchMove();
    this.player.setJump(false);
    this.player.setSneak(false);
    this.player.setSprint(false);
    this.handlers.onBreakStop();
    this.handlers.onPlaceStop();
    this.root
      .querySelectorAll(".touch-btn.active")
      .forEach((el) => el.classList.remove("active"));
  }

  // ------------------------------------------------------------------ dpad

  private setupDpad() {
    const dpad = document.getElementById("touch-dpad");
    if (!dpad) return;

    // The direction comes from where the finger sits relative to the pad's
    // centre, not from which button was first pressed. Capturing the pointer
    // on the container keeps move events coming while sliding between
    // directions instead of sticking to the button first touched.
    const down = (e: PointerEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      dpad.setPointerCapture(e.pointerId);
      this.dpadPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pushMove();
    };
    const move = (e: PointerEvent) => {
      const p = this.dpadPointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      p.x = e.clientX;
      p.y = e.clientY;
      this.pushMove();
    };
    const up = (e: PointerEvent) => {
      if (!this.dpadPointers.has(e.pointerId)) return;
      this.dpadPointers.delete(e.pointerId);
      dpad.releasePointerCapture?.(e.pointerId);
      this.pushMove();
    };

    dpad.addEventListener("pointerdown", down);
    dpad.addEventListener("pointermove", move);
    dpad.addEventListener("pointerup", up);
    dpad.addEventListener("pointercancel", up);
    dpad.addEventListener("lostpointercapture", up);
    dpad.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Deadzone in pixels before a drag registers as a direction */
  private static readonly DPAD_DEADZONE = 18;

  /**
   * Resolves every finger on the D-pad into a single -1/0/1 direction per
   * axis (corners give diagonals) and forwards it to the player.
   */
  private pushMove() {
    const dpad = document.getElementById("touch-dpad");
    let x = 0;
    let y = 0;
    if (dpad) {
      const rect = dpad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      for (const p of this.dpadPointers.values()) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        if (dx > TouchControls.DPAD_DEADZONE) x = 1;
        else if (dx < -TouchControls.DPAD_DEADZONE) x = -1;
        if (dy > TouchControls.DPAD_DEADZONE) y = -1;
        else if (dy < -TouchControls.DPAD_DEADZONE) y = 1;
      }
    }
    this.player.setTouchMove(x, y);
    this.highlightDpad(x, y);
  }

  private highlightDpad(x: number, y: number) {
    const active: Record<Dir, boolean> = {
      up: y > 0,
      down: y < 0,
      left: x < 0,
      right: x > 0,
    };
    for (const dir of Object.keys(active) as Dir[]) {
      this.root
        .querySelector(`.dpad-${dir}`)
        ?.classList.toggle("active", active[dir]);
    }
  }

  // ------------------------------------------------------------------ look

  /** Pixels a button-originated drag must move before it starts looking */
  private static readonly LOOK_DRAG_THRESHOLD = 8;
  /** Longest a touch may last and still count as a tap (ms) */
  private static readonly TAP_MAX_MS = 250;

  /**
   * Look gestures are handled on the controls container so pointer events from
   * the action buttons (which capture their pointer) bubble up here. Touches on
   * empty space look immediately; touches that begin on an action button only
   * take over the camera once dragged past a threshold, so a plain button press
   * still triggers its action without moving the view.
   */
  private setupLook() {
    this.root.addEventListener("pointerdown", (e: PointerEvent) => {
      if (!this.enabled) return;
      const target = e.target as HTMLElement;
      if (target.closest("#touch-dpad, #touch-pause, #touch-fullscreen")) {
        return;
      }
      if (target.closest(".touch-btn")) {
        this.lookCandidates.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return;
      }
      if (this.lookPointer !== null) return;
      this.lookPointer = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      this.lookStartX = e.clientX;
      this.lookStartY = e.clientY;
      this.lookStartTime = performance.now();
      this.lookMoved = false;
      this.root.setPointerCapture?.(e.pointerId);
    });
    this.root.addEventListener("pointermove", (e: PointerEvent) => {
      if (e.pointerId === this.lookPointer) {
        if (
          Math.hypot(e.clientX - this.lookStartX, e.clientY - this.lookStartY) >
          TouchControls.LOOK_DRAG_THRESHOLD
        ) {
          this.lookMoved = true;
        }
        this.player.addLook(e.clientX - this.lookX, e.clientY - this.lookY);
        this.lookX = e.clientX;
        this.lookY = e.clientY;
        return;
      }
      const start = this.lookCandidates.get(e.pointerId);
      if (!start || this.lookPointer !== null) return;
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist < TouchControls.LOOK_DRAG_THRESHOLD) return;
      this.lookCandidates.delete(e.pointerId);
      this.lookPointer = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    });
    const end = (e: PointerEvent) => {
      this.lookCandidates.delete(e.pointerId);
      if (e.pointerId !== this.lookPointer) return;
      const tap =
        e.type === "pointerup" &&
        !this.lookMoved &&
        performance.now() - this.lookStartTime < TouchControls.TAP_MAX_MS;
      this.lookPointer = null;
      this.root.releasePointerCapture?.(e.pointerId);
      if (tap) this.handlers.onUse();
    };
    this.root.addEventListener("pointerup", end);
    this.root.addEventListener("pointercancel", end);
    this.root.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // --------------------------------------------------------------- buttons

  private setupButtons() {
    const hold = (id: string, onDown: () => void, onUp: () => void): void => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e: PointerEvent) => {
        if (!this.enabled) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add("active");
        onDown();
      };
      const up = (e: PointerEvent) => {
        el.releasePointerCapture?.(e.pointerId);
        el.classList.remove("active");
        onUp();
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", up);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    };

    hold(
      "touch-jump",
      () => this.player.setJump(true),
      () => this.player.setJump(false)
    );
    hold(
      "touch-sneak",
      () => this.player.setSneak(true),
      () => this.player.setSneak(false)
    );
    hold(
      "touch-break",
      () => this.handlers.onBreakStart(),
      () => this.handlers.onBreakStop()
    );
    hold(
      "touch-place",
      () => this.handlers.onPlaceStart(),
      () => this.handlers.onPlaceStop()
    );

    this.tap("touch-sprint", () => {
      this.sprinting = !this.sprinting;
      this.player.setSprint(this.sprinting);
      this.setActive("touch-sprint", this.sprinting);
    });
    this.tap("touch-fly", () => this.player.toggleFlying());
    this.tap("touch-view", () => this.handlers.onViewToggle());
    this.tap("touch-pause", () => this.handlers.onPause());
    this.tap("touch-fullscreen", () => this.handlers.onFullscreen());
  }

  /** A press that fires once on pointerdown */
  private tap(id: string, action: () => void) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("pointerdown", (e: PointerEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      el.classList.add("active");
      action();
    });
    const release = () => el.classList.remove("active");
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private setActive(id: string, active: boolean) {
    document.getElementById(id)?.classList.toggle("active", active);
  }

  // ---------------------------------------------------------------- hotbar

  private setupHotbar() {
    const toolbar = document.getElementById("toolbar");
    if (!toolbar) return;
    toolbar.addEventListener("pointerdown", (e: PointerEvent) => {
      if (!this.enabled) return;
      const slot = (e.target as HTMLElement).closest<HTMLElement>(
        ".toolbar-slot"
      );
      if (!slot) return;
      const index = Number(slot.id.replace("toolbar-slot-", "")) - 1;
      if (index >= 0) {
        e.preventDefault();
        this.player.selectSlot(index);
      }
    });
  }
}
