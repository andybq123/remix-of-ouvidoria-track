import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Redefinir senha | Seta360" },
    { name: "description", content: "Redefinir senha no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "Redefinir senha | Seta360" },
    { property: "og:description", content: "Redefinir senha no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [valid, setValid] = useState(false);

  useEffect(() => {
    // Check if user arrived via recovery link (hash contains access_token)
    const hash = window.location.hash;
    if (!hash.includes("type=recovery") && !hash.includes("access_token")) {
      // Try to get session — if none, invalid link
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) {
          toast.error("Link inválido ou expirado. Solicite uma nova redefinição de senha.");
        } else {
          setValid(true);
        }
      });
    } else {
      setValid(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const senhaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
    if (!senhaRegex.test(password)) {
      return toast.error("A senha deve conter letra maiúscula, minúscula, número e caractere especial.");
    }
    if (password !== confirmPassword) {
      return toast.error("As senhas não coincidem.");
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha redefinida com sucesso!");
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary to-accent/40 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <Shield className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Nova Senha</CardTitle>
          <CardDescription>Digite e confirme sua nova senha</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {valid ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmar senha</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando..." : "Redefinir senha"}
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Este link de redefinição de senha é inválido ou expirou.
              </p>
              <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/forgot-password" })}>
                Solicitar novo link
              </Button>
            </div>
          )}
          <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            <Link to="/auth" className="hover:underline">Voltar para o login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
