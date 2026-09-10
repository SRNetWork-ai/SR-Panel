import { Spinner } from "@/components/ui"

export default function Loading() {
	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<Spinner className="h-7 w-7" />
		</div>
	)
}
