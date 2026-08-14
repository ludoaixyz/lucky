export const DASHBOARD_LOCALES = ['en', 'pt-BR', 'zh-CN', 'fil-PH'] as const;
export type DashboardLocale = (typeof DASHBOARD_LOCALES)[number];
export interface DashboardTranslations {
  languageName: string;
  labels: Readonly<Record<string, string>>;
}
