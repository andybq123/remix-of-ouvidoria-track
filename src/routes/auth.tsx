import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Mail, Lock, ArrowRight } from "lucide-react";
import brusqueLogo from "@/assets/brusque-brasao.png";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("unauthorized")) {
      toast.error("Seu e-mail não está autorizado a acessar o sistema.");
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    const { data: ud } = await supabase.auth.getUser();
    if (ud.user) {
      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", ud.user.id);
      if (!roles || roles.length === 0) {
        await supabase.auth.signOut();
        return toast.error("Seu e-mail não está autorizado a acessar o sistema.");
      }
    }
    toast.success("Bem-vindo!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex">
      <div className="w-full flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-secondary/20">
        <Card className="w-full max-w-md border-0 shadow-2xl bg-card/95 backdrop-blur">
          <CardHeader className="text-center space-y-2 pb-2 pt-8">
            <div className="flex justify-center mb-1">
              <img
                src={brusqueLogo}
                alt="Ouvidoria de Brusque"
                className="w-12 h-12 object-contain"
                loading="eager"
              />
            </div>
            <CardTitle className="text-2xl font-bold">Acesso ao Sistema</CardTitle>
            <p className="text-sm text-muted-foreground">
              Entre com suas credenciais para acessar
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="email" 
                    type="email" 
                    required 
                    placeholder="E-mail"
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="pl-10 h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="password" 
                    type="password" 
                    required 
                    placeholder="••••••••"
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="pl-10 h-11"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 text-base font-medium group" 
                disabled={loading}
              >
                {loading ? "Entrando..." : (
                  <>
                    Entrar
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </Button>
            </form>

            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-xs text-muted-foreground">
                <Shield className="inline h-3 w-3 mr-1" />
                Acesso restrito. Solicite ao administrador para cadastrar seu e-mail.
              </p>
            </div>

            <div className="text-center pt-1">
              <Link
                to="/inicio"
                className="text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
              >
                Conhecer o portal da Ouvidoria →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
