"use client";

import ChatDemo from "./ChatDemo";
import SimpleSteps from "./SimpleSteps";
import Banners from "./Banners";
import ServicesHub from "./ServicesHub";

/** Ordem e componentes da HOME em 47e3fba5; a Rede Vincis é montada antes daqui. */
export function HomeAntiga() {
  return <>
    <ChatDemo />
    <SimpleSteps />
    <Banners />
    <ServicesHub />
  </>;
}
