import type { Metadata } from "next";

/**
 * Central brand config for the admin panel UI (not storefront / portal).
 * To rebrand the whole panel, change the values below and drop your logo
 * file at `public/brand/` (update `logoPath` accordingly).
 */
export const PANEL_BRAND = {
  name: "SRPanel",
  nameFa: "SRPanel",
  title: "SRPanel — VPN Reseller Cloud",
  titleFa: "SRPanel — پنل ابری مدیریت نمایندگی VPN",
  description:
    "Next-gen multi-server 3x-ui reseller management — secure, fast, borderless.",
  descriptionFa: "پنل مدیریت نمایندگی نسل جدید چندسرور 3x-ui — امن، سریع، بی‌مرز.",
  logoPath: "/brand/hmpanel-logo.png",
} as const;

export const PANEL_METADATA: Metadata = {
  title: PANEL_BRAND.title,
  description: PANEL_BRAND.description,
  icons: {
    icon: [{ url: PANEL_BRAND.logoPath, type: "image/png" }],
    shortcut: PANEL_BRAND.logoPath,
    apple: PANEL_BRAND.logoPath,
  },
};
