"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { Locale } from "./format"
import { translate, type DictKey } from "./dict"

export type { DictKey } from "./dict"
export { translate } from "./dict"

const LocaleContext = createContext<Locale>("fa")

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
	return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
	return useContext(LocaleContext)
}

export function useT() {
	const locale = useLocale()
	return (key: DictKey, vars?: Record<string, string | number>) => translate(locale, key, vars)
}
