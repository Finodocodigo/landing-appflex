/* Anti-inspect — friction against casual inspection of the page (right-click,
   F12, view-source, devtools shortcuts). Not real security (nothing on the
   front end is), just friction.

   NOTE: device routing + CTA destinations are intentionally NOT here yet — the
   tracking flow ships in a later step. For now the page keeps its own links. */
(function () {
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C' || e.key === 'K')) ||
      (e.ctrlKey && (e.key === 'U' || e.key === 'u'))
    ) {
      e.preventDefault();
      return false;
    }
  });
})();
