{{-- Global submit feedback for native (non-AJAX) forms.
     On submit we disable the submit button and show a spinner, so the user can
     see the action is working and can't double-submit (important for checkout).
     AJAX forms that call preventDefault() are skipped automatically; opt a form
     out entirely with `data-no-loading`. --}}
<style>
    @keyframes fl-spin { to { transform: rotate(360deg); } }
    .fl-spinner {
        display: inline-block;
        width: 1em;
        height: 1em;
        margin-right: .5em;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 9999px;
        animation: fl-spin .6s linear infinite;
        vertical-align: -0.15em;
        flex: none;
    }
    .fl-loading { cursor: progress !important; opacity: .9; }
</style>
<script>
(function () {
    function markLoading(btn) {
        if (!btn || btn.dataset.flLoading === '1') return;
        btn.dataset.flLoading = '1';
        btn.setAttribute('aria-busy', 'true');
        btn.classList.add('fl-loading');
        // Prepend a spinner without destroying existing icons/text.
        var spinner = document.createElement('span');
        spinner.className = 'fl-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        btn.insertBefore(spinner, btn.firstChild);
        // Disable on the next tick so the button's name/value still posts.
        setTimeout(function () { btn.disabled = true; }, 0);
    }

    // Bubble phase: runs AFTER a form's own submit handler, so AJAX forms that
    // called preventDefault() are detected via e.defaultPrevented and skipped.
    document.addEventListener('submit', function (e) {
        if (e.defaultPrevented) return;
        var form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (form.hasAttribute('data-no-loading')) return;

        // Block a repeat submit of the same form while the first is in flight.
        if (form.dataset.flSubmitting === '1') { e.preventDefault(); return; }
        form.dataset.flSubmitting = '1';

        var btn = e.submitter
            || form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
        markLoading(btn);
    });
})();
</script>
