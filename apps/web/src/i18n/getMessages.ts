import type { AbstractIntlMessages } from "next-intl";
import type { Locale } from "./config";

export async function getMessages(locale: Locale) {
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return messages as AbstractIntlMessages;
}
