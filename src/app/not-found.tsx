import Link from "next/link";
import { getRequestContext } from "@/server/context";

export default async function NotFound() {
  const { t } = await getRequestContext();
  return (
    <div className="grid flex-1 place-items-center py-24 text-center">
      <div>
        <div className="font-typing text-7xl text-main">404</div>
        <h1 className="mt-3 text-xl text-sub">{t("notFound.title")}</h1>
        <Link href="/" className="btn mt-8">
          {t("notFound.back")}
        </Link>
      </div>
    </div>
  );
}
