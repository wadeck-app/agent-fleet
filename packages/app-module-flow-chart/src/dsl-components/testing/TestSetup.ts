import '@testing-library/jest-dom/vitest';

// jsdom has no layout engine; xyflow measures its container and nodes with these APIs.
class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub;

class DomMatrixReadOnlyStub {
	m22: number;
	constructor(transform?: string) {
		const scale = /scale\(([\d.]+)\)/.exec(transform ?? '')?.[1];
		this.m22 = scale === undefined ? 1 : Number(scale);
	}
}
globalThis.DOMMatrixReadOnly = DomMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;

Object.defineProperties(HTMLElement.prototype, {
	offsetWidth: { configurable: true, get: () => 1000 },
	offsetHeight: { configurable: true, get: () => 600 },
});

// jsdom has no PointerEvent: without it a fired pointer event loses clientX / pointerId, which the drawer resize reads.
if (typeof globalThis.PointerEvent === 'undefined') {
	class PointerEventStub extends MouseEvent {
		pointerId: number;
		constructor(type: string, init: PointerEventInit = {}) {
			super(type, init);
			this.pointerId = init.pointerId ?? 0;
		}
	}
	globalThis.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}
