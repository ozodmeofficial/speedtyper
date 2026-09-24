import { getRequestContext } from "@/server/context";
import { initialTestFor } from "@/server/initialTest";
import { TypingTest } from "@/components/test/TypingTest";

export default async function HomePage() {
  const { settings } = await getRequestContext();
  return <TypingTest initial={initialTestFor(settings)} />;
}
