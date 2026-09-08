import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { constrainWeightWindow, gestureWeightWindow, snapWeightWindow, type WeightWindow } from "../weight-window";

const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 400;
type Position = { readonly x: number; readonly y: number };
type Gesture
  = | { readonly kind: "pending" | "pan"; readonly origin: Position; readonly window: WeightWindow }
    | { readonly kind: "pinch"; readonly positions: readonly [number, number]; readonly window: WeightWindow }
    | { readonly kind: "inspect" }
    | { readonly kind: "scroll" };

type Options = {
  readonly window: WeightWindow;
  readonly bounds: WeightWindow;
  readonly plotWidth: number;
  readonly plotLeft: number;
  readonly onWindowChange: (window: WeightWindow) => void;
  readonly onInspect: (x: number | null) => void;
};

export const useWeightChartGesture = ({ window, bounds, plotWidth, plotLeft, onWindowChange, onInspect }: Options) => {
  const pointers = useRef(new Map<number, Position>());
  const gesture = useRef<Gesture | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentWindow = useRef(window);
  const [preview, setPreview] = useState<WeightWindow | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pinned, setPinned] = useState(false);
  const clearLongPress = () => {
    if (longPress.current !== null) clearTimeout(longPress.current);
    longPress.current = null;
  };
  useEffect(() => clearLongPress, []);
  const position = (event: PointerEvent<SVGSVGElement>): Position => ({
    x: event.clientX - event.currentTarget.getBoundingClientRect().left - plotLeft,
    y: event.clientY,
  });
  const previewWindow = (next: WeightWindow) => {
    currentWindow.current = next;
    setPreview(next);
    setDragging(true);
    setPinned(false);
    onInspect(null);
  };
  const finishWindow = () => {
    if (gesture.current?.kind === "pan" || gesture.current?.kind === "pinch") {
      const snapped = snapWeightWindow(currentWindow.current);
      if (snapped.start !== window.start || snapped.end !== window.end) onWindowChange(snapped);
    }
    setPreview(null);
    setDragging(false);
  };
  const startPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const point = position(event);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    clearLongPress();
    const [first, second] = [...pointers.current.values()];
    if (first !== undefined && second !== undefined) {
      gesture.current = { kind: "pinch", positions: [first.x, second.x], window: currentWindow.current };
      setPinned(false);
      onInspect(null);
      return;
    }
    currentWindow.current = window;
    gesture.current = { kind: "pending", origin: point, window };
    if (event.pointerType !== "mouse") {
      longPress.current = setTimeout(() => {
        gesture.current = { kind: "inspect" };
        setPinned(true);
        onInspect(point.x + plotLeft);
      }, LONG_PRESS_MS);
    }
  };
  const movePointer = (event: PointerEvent<SVGSVGElement>) => {
    const point = position(event);
    if (!pointers.current.has(event.pointerId)) {
      if (event.pointerType === "mouse" && !pinned) onInspect(point.x + plotLeft);
      return;
    }
    pointers.current.set(event.pointerId, point);
    const active = gesture.current;
    if (active === null || active.kind === "scroll") return;
    if (active.kind === "pinch") {
      const [first, second] = [...pointers.current.values()];
      if (first !== undefined && second !== undefined) {
        previewWindow(gestureWeightWindow(active.window, bounds, active.positions, [first.x, second.x], plotWidth));
      }
      return;
    }
    if (active.kind === "inspect") {
      onInspect(point.x + plotLeft);
      return;
    }
    const dx = point.x - active.origin.x;
    const dy = point.y - active.origin.y;
    if (active.kind === "pending") {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      clearLongPress();
      if (event.pointerType !== "mouse" && Math.abs(dy) > Math.abs(dx)) {
        gesture.current = { kind: "scroll" };
        return;
      }
      gesture.current = { ...active, kind: "pan" };
    }
    const shift = -dx / plotWidth * (active.window.end - active.window.start);
    previewWindow(constrainWeightWindow({ start: active.window.start + shift, end: active.window.end + shift }, bounds));
  };
  const endPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    clearLongPress();
    const remaining = [...pointers.current.values()][0];
    if (remaining !== undefined) {
      // ピンチ後に残った指は移動を継続し、タップや長押しには切り替えない。
      gesture.current = { kind: "pan", origin: remaining, window: currentWindow.current };
      return;
    }
    if (gesture.current?.kind === "pending") {
      onInspect(position(event).x + plotLeft);
      setPinned(true);
    }
    finishWindow();
    gesture.current = null;
  };
  const cancelPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    clearLongPress();
    // ページのスクロールに引き継がれた操作では、途中の横移動を期間に反映しない。
    setPreview(null);
    setDragging(false);
    pointers.current.clear();
    gesture.current = null;
    setPinned(false);
    onInspect(null);
  };
  const dismissInspection = () => {
    setPinned(false);
    onInspect(null);
  };
  return {
    preview,
    dragging,
    dismissInspection,
    pointerHandlers: {
      onPointerDown: startPointer,
      onPointerMove: movePointer,
      onPointerUp: endPointer,
      onPointerCancel: cancelPointer,
      onLostPointerCapture: cancelPointer,
      onPointerLeave: () => { if (!pinned && pointers.current.size === 0) onInspect(null); },
      onContextMenu: (event: MouseEvent<SVGSVGElement>) => event.preventDefault(),
    },
  };
};
