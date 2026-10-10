// jsdom doesn't implement element scrolling; components call it from $effect.
if (!Element.prototype.scrollTo) {
	Element.prototype.scrollTo = function () {};
}
