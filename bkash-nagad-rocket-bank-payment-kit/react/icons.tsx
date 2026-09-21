/**
 * The checkout's icons, drawn inline — no icon font, no CDN, no dependency.
 *
 * Each entry is the exact path data of the lucide icon the production page
 * renders (lucide v0.577, ISC licence), keyed by the name the JSX uses. The
 * <i class="fa-icon"> wrapper is what checkout.css sizes and colours: the
 * SVG is 1em and currentColor, so an icon follows the text it sits beside.
 *
 * Generated from the lucide package — to add an icon, add its node list
 * here AND in vanilla/send-money-checkout.js (same data, same names).
 */
import React from 'react';

type IconNode = [tag: string, attrs: Record<string, string>][];

const ICONS: Record<string, IconNode> = {
    'arrow-right': [['path', {"d":"M5 12h14"}], ['path', {"d":"m12 5 7 7-7 7"}]],
    'check': [['path', {"d":"M20 6 9 17l-5-5"}]],
    'circle-check': [['circle', {"cx":"12","cy":"12","r":"10"}], ['path', {"d":"m9 12 2 2 4-4"}]],
    'circle-exclamation': [['circle', {"cx":"12","cy":"12","r":"10"}], ['line', {"x1":"12","x2":"12","y1":"8","y2":"12"}], ['line', {"x1":"12","x2":"12.01","y1":"16","y2":"16"}]],
    'copy': [['rect', {"width":"14","height":"14","x":"8","y":"8","rx":"2","ry":"2"}], ['path', {"d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]],
    'credit-card': [['rect', {"width":"20","height":"14","x":"2","y":"5","rx":"2"}], ['line', {"x1":"2","x2":"22","y1":"10","y2":"10"}]],
    'hourglass': [['path', {"d":"M5 22h14"}], ['path', {"d":"M5 2h14"}], ['path', {"d":"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"}], ['path', {"d":"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"}]],
    'building-columns': [['path', {"d":"M10 18v-7"}], ['path', {"d":"M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"}], ['path', {"d":"M14 18v-7"}], ['path', {"d":"M18 18v-7"}], ['path', {"d":"M3 22h18"}], ['path', {"d":"M6 18v-7"}]],
    'list-check': [['path', {"d":"M13 5h8"}], ['path', {"d":"M13 12h8"}], ['path', {"d":"M13 19h8"}], ['path', {"d":"m3 17 2 2 4-4"}], ['path', {"d":"m3 7 2 2 4-4"}]],
    'lock': [['rect', {"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2"}], ['path', {"d":"M7 11V7a5 5 0 0 1 10 0v4"}]],
    'pencil': [['path', {"d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}], ['path', {"d":"m15 5 4 4"}]],
    'phone': [['path', {"d":"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"}]],
    'phone-volume': [['path', {"d":"M13 2a9 9 0 0 1 9 9"}], ['path', {"d":"M13 6a5 5 0 0 1 5 5"}], ['path', {"d":"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"}]],
    'rotate-left': [['path', {"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}], ['path', {"d":"M3 3v5h5"}]],
    'search': [['path', {"d":"m21 21-4.34-4.34"}], ['circle', {"cx":"11","cy":"11","r":"8"}]],
    'stopwatch': [['line', {"x1":"10","x2":"14","y1":"2","y2":"2"}], ['line', {"x1":"12","x2":"15","y1":"14","y2":"11"}], ['circle', {"cx":"12","cy":"14","r":"8"}]],
    'user': [['path', {"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}], ['circle', {"cx":"12","cy":"7","r":"4"}]],
    'wallet': [['path', {"d":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"}], ['path', {"d":"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"}]],
    'xmark': [['path', {"d":"M18 6 6 18"}], ['path', {"d":"m6 6 12 12"}]],
};

// The real WhatsApp mark, not a speech bubble: on this page the visitor is
// deciding whether to trust a stranger with money, and the green phone in a
// bubble is the one icon every one of them already knows.
const WHATSAPP_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';

export type IconName = keyof typeof ICONS | 'whatsapp';

type Props = {
    icon: IconName;
    /** Extra classes the stylesheet keys on (icon-grad-3, and so on). */
    className?: string;
};

/** Stroke width 2.25 at 24 units, exactly as production draws them. */
export const Fa: React.FC<Props> = ({ icon, className }) => {
    const nodes = ICONS[icon as string];
    const cls = className ? `fa-icon ${className}` : 'fa-icon';
    return (
        <i className={cls} aria-hidden="true">
            {icon === 'whatsapp'
                ? <svg width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={WHATSAPP_PATH} /></svg>
                : nodes
                    ? (
                        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {nodes.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
                        </svg>
                    )
                    : null}
        </i>
    );
};

/** A bare lucide glyph (no <i> wrapper) for the answer panel's icons and the
 *  buttons that size their SVG directly — width/height come from CSS. */
export const Glyph: React.FC<{ icon: Exclude<IconName, 'whatsapp'>; className?: string }> = ({ icon, className }) => {
    const nodes = ICONS[icon as string];
    if (!nodes) return null;
    return (
        <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {nodes.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
        </svg>
    );
};

/** The one payment method with no logo of its own. Same tile as the three
 *  wallets, drawn in-house on the brand blue. */
export const BankTileIcon: React.FC = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 21h18M4 18h16M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 3 3 8h18L12 3z" />
    </svg>
);
