"use client";

import { Hero } from "@/features/home";
import { ChatDemo } from "@/features/home";
import { SimpleSteps } from "@/features/home";
import { Banners } from "@/features/home";
import { ServicesHub } from "@/features/home";
import { CTA } from "@/features/home";
import { Pricing } from "@/features/home";

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      <Hero />
      <ChatDemo />
      <SimpleSteps />
      <Banners />
      <ServicesHub />
      <CTA />
      <Pricing />
    </main>
  );
}
