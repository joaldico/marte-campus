import type { GlobalThemeOverrides } from 'naive-ui'

export const campusTheme: GlobalThemeOverrides = {
  common: {
    fontFamily:
      'Outfit, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
    primaryColor: '#22d3ee',
    primaryColorHover: '#67e8f9',
    primaryColorPressed: '#06b6d4',
    primaryColorSuppl: '#8b5cf6',
    infoColor: '#38bdf8',
    successColor: '#34d399',
    warningColor: '#fbbf24',
    errorColor: '#fb7185',
    bodyColor: '#070b16',
    cardColor: '#10182c',
    modalColor: '#10182c',
    popoverColor: '#121a32',
    tableColor: '#10182c',
    inputColor: '#0c1324',
    borderColor: 'rgba(103, 232, 249, 0.16)',
    dividerColor: 'rgba(148, 163, 184, 0.14)',
    textColorBase: '#f8fafc',
    textColor1: 'rgba(248, 250, 252, 0.94)',
    textColor2: 'rgba(226, 232, 240, 0.78)',
    textColor3: 'rgba(148, 163, 184, 0.82)',
    hoverColor: 'rgba(34, 211, 238, 0.08)',
    borderRadius: '12px',
  },
  Layout: {
    color: '#070b16',
    headerColor: 'rgba(7, 11, 22, 0.86)',
    headerBorderColor: 'rgba(103, 232, 249, 0.12)',
  },
  Card: {
    borderRadius: '16px',
    color: '#10182c',
    borderColor: 'rgba(103, 232, 249, 0.12)',
  },
  Menu: {
    itemTextColorHorizontal: 'rgba(226, 232, 240, 0.78)',
    itemTextColorHoverHorizontal: '#67e8f9',
    itemTextColorActiveHorizontal: '#22d3ee',
    itemTextColorActiveHoverHorizontal: '#67e8f9',
  },
  Button: {
    borderRadiusMedium: '10px',
  },
}
