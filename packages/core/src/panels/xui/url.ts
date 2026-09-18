/**
 * Accepts anything an operator may paste (bare host, host:port, or a deep link inside the
 * panel) and returns origin + webBasePath, which is what every /panel/api/* route hangs off.
 */
export function normalizePanelBaseUrl(input: string): string {
	let url = String(input ?? "").trim()
	if (!url) return ""
	if (!/^https?:\/\//i.test(url)) url = "http://" + url
	url = url.replace(/[?#].*$/, "").replace(/\/+$/, "")
	url = url.replace(/\/panel\/api(\/.*)?$/i, "")
	url = url.replace(/\/panel\/(inbounds|clients|settings|xray|nodes|hosts)(\/.*)?$/i, "")
	url = url.replace(/\/(login|logout)$/i, "")
	return url.replace(/\/+$/, "")
}
