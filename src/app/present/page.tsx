import type { Metadata } from "next";
import { Presenter } from "@/components/present/presenter";

export const metadata: Metadata = { title: "Presenter · Debrief" };

export default function PresentPage() {
  return <Presenter />;
}
