import { getRequestConfig } from "next-intl/server";
import { getLocale } from "./getLocale";
import { getMessages } from "./getMessages";
import { isLocale, type Locale } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  let locale: Locale;

  if (requested && isLocale(requested)) {
    locale = requested;
  } else {
    locale = await getLocale();
  }

  return {
    locale,
    messages: await getMessages(locale),
  };
});
