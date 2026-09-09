export class AppError extends Error {
	constructor(message: string, public status = 400, public code = "bad_request") {
		super(message)
		this.name = "AppError"
	}
}
export class UnauthorizedError extends AppError {
	constructor(m = "ورود لازم است") { super(m, 401, "unauthorized") }
}
export class ForbiddenError extends AppError {
	constructor(m = "دسترسی غیرمجاز") { super(m, 403, "forbidden") }
}
export class NotFoundError extends AppError {
	constructor(m = "پیدا نشد") { super(m, 404, "not_found") }
}
export class PanelError extends AppError {
	constructor(m: string) { super(m, 502, "panel_error") }
}
export class PanelAuthError extends PanelError {
	constructor(m: string) { super(m); this.code = "panel_auth_error" }
}
