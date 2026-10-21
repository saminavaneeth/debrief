import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlaceholderScreen } from "@/components/shell/placeholder-screen";

export default function TodayPage() {
  return (
    <div className="space-y-6">
      <PlaceholderScreen title="Today" body="Your shift, scenarios and Inbox will appear here." />
      <Button size="lg" className="h-16 w-full text-base">
        <Mic className="size-5" aria-hidden />
        Capture
      </Button>
    </div>
  );
}
