import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "OuviDesk | Ouvidoria de Brusque" },
    { name: "description", content: "Acesso ao sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "OuviDesk | Ouvidoria de Brusque" },
    { property: "og:description", content: "Acesso ao sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});