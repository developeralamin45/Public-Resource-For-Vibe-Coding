/**
 * The banner half of useBuildChanged — deliberately plain so it inherits your
 * design system rather than fighting it. Restyle freely; keep the behaviour:
 * never reload without being asked.
 *
 *   const updateAvailable = useBuildChanged(navState.build);
 *   <UpdateAvailable show={updateAvailable} />
 */
export function UpdateAvailable({
    show,
    message = 'A new version is available.',
    action = 'Refresh',
}: {
    show: boolean;
    message?: string;
    action?: string;
}) {
    if (!show) return null;

    return (
        <div
            role="status"
            style={{
                position: 'fixed',
                right: 24,
                bottom: 24,
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                maxWidth: 380,
                padding: '12px 14px',
                borderRadius: 12,
                background: '#111827',
                color: '#e5e7eb',
                boxShadow: '0 10px 30px rgba(0,0,0,.35)',
            }}
        >
            <span style={{ flex: 1, fontSize: 14 }}>{message}</span>
            <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 0,
                    background: '#2563eb',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                {action}
            </button>
        </div>
    );
}
