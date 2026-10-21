import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PlaceholderScreen } from "@/components/shell/placeholder-screen";

export default function RecordsPage() {
  return (
    <div className="space-y-4">
      <PlaceholderScreen title="Records" body="Records pushed to connected EHS systems." />
      <Link
        href="/console"
        className="hover:bg-muted inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 font-medium"
      >
        Open the EHS console
        <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
