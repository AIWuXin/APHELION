import { wrap } from './icon-kit';
import { ICON_B_REPAIR } from './icons-assets';

export const ICON_SCAN = wrap('<path d="M4 20h16M8 20v-7"/><path d="M8 13l8-7 4 4-8 7z"/><path d="M18 4a7 7 0 0 1 2 5"/>');
export const ICON_ROUTE = wrap('<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 17C11 13 13 8 17 7"/>');
export const ICON_TECH = wrap('<circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M12 11l-5 5M12 11l5 5"/>');
export const ICON_LOG = wrap('<path d="M4 6h16M4 12h10M4 18h13"/>');
export const ICON_RETICLE = wrap('<circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1"/>');
export const ICON_ALLOY = wrap('<path d="M6 9h12l3 5-3 5H6l-3-5z"/><path d="M6 9l-3 5h18"/>');
export const ICON_ENERGY = wrap('<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>');
export const ICON_FUEL = wrap('<path d="M8 21V8h8v13z"/><path d="M8 12h8M11 8V4h2v4"/><path d="M12 15v3"/>');
export const ICON_COAL = wrap('<path d="M4 17l3-6 5-3 6 2 2 5-3 4H7z"/><path d="M9 11l2 3M14 12l-1 4"/>');
export const ICON_RESEARCH = wrap('<path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M9 3h6M8 15h8"/>');
export const ICON_PAUSE = wrap('<path d="M9 5v14M15 5v14"/>');
export const ICON_PLAY = wrap('<path d="M8 5l11 7-11 7z"/>');
export const ICON_LAUNCH = wrap('<path d="M12 3c3 3 4 7 4 11l-4 3-4-3c0-4 1-8 4-11z"/><path d="M8 14l-2 5 4-1M16 14l2 5-4-1"/>');
export const ICON_DEMOLISH = wrap('<path d="M4 21h16M7 21V9l5-4 5 4v12"/><path d="M3 9l18-4M10 14l4 4M14 14l-4 4"/>');
export const ICON_INFINITE = wrap('<path d="M6 12a3 3 0 1 0 3-3c-2 0-3 1.5-3 3s1 3 3 3c3 0 4-6 7-6a3 3 0 1 1-3 3c2 0 3-1.5 3-3s-1-3-3-3c-3 0-4 6-7 6z"/>');
export const ICON_BOLT = wrap('<path d="M13 2L6 13h5l-1 9 7-11h-5z"/>');
export const ICON_STRUCTURE = wrap('<path d="M4 20h16M6 20V9h12v11"/><path d="M10 20v-6h4v6M9 9V6h6v3"/>');
export const ICON_CRAFT = wrap('<path d="M12 4l6 14-6-4-6 4z"/>');
export const ICON_SIGNAL = wrap('<path d="M4 12h3l4-7 4 14 3-7h2"/>');

export const CATEGORY_ICONS: readonly string[] = [ICON_STRUCTURE, ICON_ROUTE, ICON_LAUNCH, ICON_B_REPAIR];
export { BUILDING_ICONS, UNIT_ICONS } from './icons-assets';
