"use client";

import { ChatDemo } from "@/features/home";
import { SimpleSteps } from "@/features/home";
import { Banners } from "@/features/home";
import { ServicesHub } from "@/features/home";

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <ChatDemo />
      <SimpleSteps />
      <Banners />
      <ServicesHub />
    </main>
  );
}
