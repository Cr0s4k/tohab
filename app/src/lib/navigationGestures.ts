/** Stop browser history gestures before Safari claims a touch at either screen edge. */
export function preventEdgeNavigation(event: TouchEvent, viewportWidth: number): void {
	if (!event.cancelable || event.touches.length !== 1) return;
	const x = event.touches[0].clientX;
	if (x <= 16 || x >= viewportWidth - 16) event.preventDefault();
}
