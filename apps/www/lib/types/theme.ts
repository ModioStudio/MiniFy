export type RawTheme = {
  name: string;
  panel?: {
    background?: string;
    borderRadius?: number;
    shadow?: string;
  };
  controls?: {
    iconColor?: string;
    iconColorActive?: string;
    iconBackground?: string;
    iconBackgroundHover?: string;
  };
  playbar?: {
    trackBg?: string;
    trackFill?: string;
    thumbColor?: string;
    timeTextColor?: string;
  };
  typography?: {
    songTitle?: {
      color?: string;
      weight?: number;
    };
    songArtist?: {
      color?: string;
      weight?: number;
    };
  };
  actions?: {
    iconColor?: string;
    iconBackground?: string;
    iconBackgroundHover?: string;
  };
  cover?: {
    borderColor?: string;
    borderRadius?: number;
  };
  settings?: {
    panelBg?: string;
    panelBorder?: string;
    text?: string;
    textMuted?: string;
    itemHover?: string;
    itemActive?: string;
    accent?: string;
  };
};

export type ThemeConfig = {
  name: string;
  panel: string;
  panelRadius: number;
  panelShadow: string;
  controlsColor: string;
  controlsColorActive: string;
  playbarTrackBg: string;
  playbarTrackFill: string;
  playbarThumbColor: string;
  playbarTimeColor: string;
  songTitleColor: string;
  songArtistColor: string;
  actionsColor: string;
  actionsBg: string;
  actionsBgHover: string;
  coverBorderColor: string;
  coverRadius: number;
};

export type ThemeMeta = {
  id: string;
  name: string;
  file: string;
};

export type LayoutType = "A" | "B" | "C";

export type ThemeIndex = {
  themes: ThemeMeta[];
  layouts: LayoutType[];
  defaultTheme: string;
  defaultLayout: LayoutType;
};
