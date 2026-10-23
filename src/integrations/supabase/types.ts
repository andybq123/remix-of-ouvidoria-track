export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_config: {
        Row: {
          api_key: string | null
          gemini_api_key: string | null
          gemini_model: string | null
          grok_api_key: string | null
          grok_model: string | null
          id: boolean
          lovable_model: string | null
          model: string | null
          priority: string[]
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_key?: string | null
          gemini_api_key?: string | null
          gemini_model?: string | null
          grok_api_key?: string | null
          grok_model?: string | null
          id?: boolean
          lovable_model?: string | null
          model?: string | null
          priority?: string[]
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_key?: string | null
          gemini_api_key?: string | null
          gemini_model?: string | null
          grok_api_key?: string | null
          grok_model?: string | null
          id?: boolean
          lovable_model?: string | null
          model?: string | null
          priority?: string[]
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      allowed_emails: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          nome: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          nome?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          nome?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      assuntos: {
        Row: {
          ativo: boolean
          created_at: string
          forcar_triagem: boolean
          grupo: string | null
          id: string
          nome: string
          secretaria_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          forcar_triagem?: boolean
          grupo?: string | null
          id?: string
          nome: string
          secretaria_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          forcar_triagem?: boolean
          grupo?: string | null
          id?: string
          nome?: string
          secretaria_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assuntos_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      atualizacao_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          etapa: number
          etapas_total: number
          id: string
          log: string | null
          mensagem: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          etapa?: number
          etapas_total?: number
          id?: string
          log?: string | null
          mensagem?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          etapa?: number
          etapas_total?: number
          id?: string
          log?: string | null
          mensagem?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      coletas: {
        Row: {
          atualizados: number
          duracao_ms: number | null
          erro: string | null
          executado_em: string
          id: string
          ignorados_detalhes: Json
          ja_concluidos: number
          novos: number
          origem: string
          sem_correspondencia: number
          sucesso: boolean
          total: number
        }
        Insert: {
          atualizados?: number
          duracao_ms?: number | null
          erro?: string | null
          executado_em?: string
          id?: string
          ignorados_detalhes?: Json
          ja_concluidos?: number
          novos?: number
          origem?: string
          sem_correspondencia?: number
          sucesso?: boolean
          total?: number
        }
        Update: {
          atualizados?: number
          duracao_ms?: number | null
          erro?: string | null
          executado_em?: string
          id?: string
          ignorados_detalhes?: Json
          ja_concluidos?: number
          novos?: number
          origem?: string
          sem_correspondencia?: number
          sucesso?: boolean
          total?: number
        }
        Relationships: []
      }
      email_inbox_accounts: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          email: string
          gmail_history_id: string | null
          id: string
          imap_host: string | null
          imap_last_uid: number | null
          imap_password: string | null
          imap_port: number | null
          imap_tls: boolean | null
          imap_uid_validity: string | null
          imap_user: string | null
          provider: string
          secretaria_id: string | null
          token: string
          ultima_sincronizacao: string | null
          ultima_sync_erro_detalhe: string | null
          ultima_sync_erros: number
          ultima_sync_novos: number
          ultima_sync_processados: number
          ultima_sync_sucesso_em: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          email: string
          gmail_history_id?: string | null
          id?: string
          imap_host?: string | null
          imap_last_uid?: number | null
          imap_password?: string | null
          imap_port?: number | null
          imap_tls?: boolean | null
          imap_uid_validity?: string | null
          imap_user?: string | null
          provider?: string
          secretaria_id?: string | null
          token?: string
          ultima_sincronizacao?: string | null
          ultima_sync_erro_detalhe?: string | null
          ultima_sync_erros?: number
          ultima_sync_novos?: number
          ultima_sync_processados?: number
          ultima_sync_sucesso_em?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          email?: string
          gmail_history_id?: string | null
          id?: string
          imap_host?: string | null
          imap_last_uid?: number | null
          imap_password?: string | null
          imap_port?: number | null
          imap_tls?: boolean | null
          imap_uid_validity?: string | null
          imap_user?: string | null
          provider?: string
          secretaria_id?: string | null
          token?: string
          ultima_sincronizacao?: string | null
          ultima_sync_erro_detalhe?: string | null
          ultima_sync_erros?: number
          ultima_sync_novos?: number
          ultima_sync_processados?: number
          ultima_sync_sucesso_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_inbox_accounts_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      email_inbox_log: {
        Row: {
          account_id: string | null
          ai_provider: string | null
          assunto: string | null
          corpo: string | null
          destinatario: string | null
          erro: string | null
          external_id: string | null
          id: string
          processado_em: string | null
          protocolo_id: string | null
          recebido_em: string
          remetente: string | null
          status: string
        }
        Insert: {
          account_id?: string | null
          ai_provider?: string | null
          assunto?: string | null
          corpo?: string | null
          destinatario?: string | null
          erro?: string | null
          external_id?: string | null
          id?: string
          processado_em?: string | null
          protocolo_id?: string | null
          recebido_em?: string
          remetente?: string | null
          status?: string
        }
        Update: {
          account_id?: string | null
          ai_provider?: string | null
          assunto?: string | null
          corpo?: string | null
          destinatario?: string | null
          erro?: string | null
          external_id?: string | null
          id?: string
          processado_em?: string | null
          protocolo_id?: string | null
          recebido_em?: string
          remetente?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_inbox_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_inbox_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inbox_log_protocolo_id_fkey"
            columns: ["protocolo_id"]
            isOneToOne: false
            referencedRelation: "protocolos"
            referencedColumns: ["id"]
          },
        ]
      }
      locais: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          secretaria_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          secretaria_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          secretaria_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locais_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      onedoc_config: {
        Row: {
          id: boolean
          senha_cifrada: string | null
          updated_at: string
          updated_by: string | null
          url_login: string | null
          usuario: string | null
        }
        Insert: {
          id?: boolean
          senha_cifrada?: string | null
          updated_at?: string
          updated_by?: string | null
          url_login?: string | null
          usuario?: string | null
        }
        Update: {
          id?: boolean
          senha_cifrada?: string | null
          updated_at?: string
          updated_by?: string | null
          url_login?: string | null
          usuario?: string | null
        }
        Relationships: []
      }
      onedoc_jobs: {
        Row: {
          atualizados: number
          contexto: Json
          created_at: string
          criado_por: string | null
          erros: number
          finalizado_em: string | null
          id: string
          iniciado_em: string | null
          mensagem: string | null
          processados: number
          protocolo_ids: string[]
          resultados: Json
          status: string
          tipo: string
          total: number
        }
        Insert: {
          atualizados?: number
          contexto?: Json
          created_at?: string
          criado_por?: string | null
          erros?: number
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          mensagem?: string | null
          processados?: number
          protocolo_ids?: string[]
          resultados?: Json
          status?: string
          tipo?: string
          total?: number
        }
        Update: {
          atualizados?: number
          contexto?: Json
          created_at?: string
          criado_por?: string | null
          erros?: number
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          mensagem?: string | null
          processados?: number
          protocolo_ids?: string[]
          resultados?: Json
          status?: string
          tipo?: string
          total?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      protocolo_historico: {
        Row: {
          acao: string
          autor_id: string | null
          autor_nome: string | null
          campo: string
          contexto: Json
          created_at: string
          id: string
          protocolo_id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao?: string
          autor_id?: string | null
          autor_nome?: string | null
          campo: string
          contexto?: Json
          created_at?: string
          id?: string
          protocolo_id: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          autor_id?: string | null
          autor_nome?: string | null
          campo?: string
          contexto?: Json
          created_at?: string
          id?: string
          protocolo_id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocolo_historico_protocolo_id_fkey"
            columns: ["protocolo_id"]
            isOneToOne: false
            referencedRelation: "protocolos"
            referencedColumns: ["id"]
          },
        ]
      }
      protocolos: {
        Row: {
          assunto: string
          categoria: Database["public"]["Enums"]["protocolo_categoria"]
          coletado_em: string | null
          contato_solicitante: string | null
          created_at: string
          created_by: string | null
          data_abertura: string
          data_conclusao: string | null
          data_prorrogacao: string | null
          descricao: string | null
          detalhes: Json | null
          endereco: string | null
          esic_prorrogacao_justificativa: string | null
          hash_consulta: string | null
          id: string
          ip_solicitante: string | null
          lat_solicitante: number | null
          latitude: number | null
          lng_solicitante: number | null
          local_id: string | null
          longitude: number | null
          numero: string
          numero_esic: string | null
          onedoc_arquivado_em: string | null
          onedoc_baixado_em: string | null
          onedoc_situacao: string | null
          onedoc_verificado_em: string | null
          origem: string | null
          prorrogado: boolean
          resolucao: string | null
          responsavel_id: string | null
          secretaria_id: string | null
          sigilo: string
          solicitante: string | null
          status: Database["public"]["Enums"]["protocolo_status"]
          tipo: Database["public"]["Enums"]["protocolo_tipo"]
          triagem_concluida_em: string | null
          triagem_concluida_por: string | null
          triagem_lock_em: string | null
          triagem_lock_por: string | null
          triagem_pendente: boolean
          updated_at: string
          url: string | null
        }
        Insert: {
          assunto: string
          categoria?: Database["public"]["Enums"]["protocolo_categoria"]
          coletado_em?: string | null
          contato_solicitante?: string | null
          created_at?: string
          created_by?: string | null
          data_abertura?: string
          data_conclusao?: string | null
          data_prorrogacao?: string | null
          descricao?: string | null
          detalhes?: Json | null
          endereco?: string | null
          esic_prorrogacao_justificativa?: string | null
          hash_consulta?: string | null
          id?: string
          ip_solicitante?: string | null
          lat_solicitante?: number | null
          latitude?: number | null
          lng_solicitante?: number | null
          local_id?: string | null
          longitude?: number | null
          numero: string
          numero_esic?: string | null
          onedoc_arquivado_em?: string | null
          onedoc_baixado_em?: string | null
          onedoc_situacao?: string | null
          onedoc_verificado_em?: string | null
          origem?: string | null
          prorrogado?: boolean
          resolucao?: string | null
          responsavel_id?: string | null
          secretaria_id?: string | null
          sigilo?: string
          solicitante?: string | null
          status?: Database["public"]["Enums"]["protocolo_status"]
          tipo: Database["public"]["Enums"]["protocolo_tipo"]
          triagem_concluida_em?: string | null
          triagem_concluida_por?: string | null
          triagem_lock_em?: string | null
          triagem_lock_por?: string | null
          triagem_pendente?: boolean
          updated_at?: string
          url?: string | null
        }
        Update: {
          assunto?: string
          categoria?: Database["public"]["Enums"]["protocolo_categoria"]
          coletado_em?: string | null
          contato_solicitante?: string | null
          created_at?: string
          created_by?: string | null
          data_abertura?: string
          data_conclusao?: string | null
          data_prorrogacao?: string | null
          descricao?: string | null
          detalhes?: Json | null
          endereco?: string | null
          esic_prorrogacao_justificativa?: string | null
          hash_consulta?: string | null
          id?: string
          ip_solicitante?: string | null
          lat_solicitante?: number | null
          latitude?: number | null
          lng_solicitante?: number | null
          local_id?: string | null
          longitude?: number | null
          numero?: string
          numero_esic?: string | null
          onedoc_arquivado_em?: string | null
          onedoc_baixado_em?: string | null
          onedoc_situacao?: string | null
          onedoc_verificado_em?: string | null
          origem?: string | null
          prorrogado?: boolean
          resolucao?: string | null
          responsavel_id?: string | null
          secretaria_id?: string | null
          sigilo?: string
          solicitante?: string | null
          status?: Database["public"]["Enums"]["protocolo_status"]
          tipo?: Database["public"]["Enums"]["protocolo_tipo"]
          triagem_concluida_em?: string | null
          triagem_concluida_por?: string | null
          triagem_lock_em?: string | null
          triagem_lock_por?: string | null
          triagem_pendente?: boolean
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "protocolos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocolos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "secretaria_responsaveis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocolos_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocolos_triagem_concluida_por_fkey"
            columns: ["triagem_concluida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "protocolos_triagem_lock_por_fkey"
            columns: ["triagem_lock_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      protocolos_antigos_conclusoes: {
        Row: {
          ano: number
          created_at: string
          data_conclusao: string | null
          id: string
          numero: number
          resolucao: string | null
          source: string
          updated_at: string
          url: string | null
        }
        Insert: {
          ano: number
          created_at?: string
          data_conclusao?: string | null
          id?: string
          numero: number
          resolucao?: string | null
          source: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          ano?: number
          created_at?: string
          data_conclusao?: string | null
          id?: string
          numero?: number
          resolucao?: string | null
          source?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      secretaria_responsaveis: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          nome: string
          secretaria_id: string
          telefone: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome: string
          secretaria_id: string
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nome?: string
          secretaria_id?: string
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "secretaria_responsaveis_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      secretarias: {
        Row: {
          created_at: string
          created_by: string | null
          endereco: string | null
          icone: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          sigla: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          endereco?: string | null
          icone?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          sigla?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          endereco?: string | null
          icone?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          sigla?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_secretarias: {
        Row: {
          created_at: string
          email: string
          id: string
          secretaria_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          secretaria_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          secretaria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_secretarias_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplicar_conferencia_1doc: {
        Args: { p_anterior: Json; p_id: string; p_patch: Json }
        Returns: undefined
      }
      backup_exportar_usuarios: { Args: never; Returns: Json }
      backup_importar: {
        Args: { p_rows: Json; p_tabela: string }
        Returns: number
      }
      backup_importar_usuarios: { Args: { p: Json }; Returns: Json }
      bi_estatisticas: { Args: { p_mes?: string }; Returns: Json }
      concluir_triagem: {
        Args: { p_id: string; p_local: string; p_secretaria: string }
        Returns: Json
      }
      concluir_triagem_admin: {
        Args: { p_id: string; p_local: string; p_secretaria: string }
        Returns: Json
      }
      consultar_protocolo_publico: {
        Args: { p_hash: string; p_numero: string }
        Returns: {
          assunto: string
          categoria: Database["public"]["Enums"]["protocolo_categoria"]
          contato_solicitante: string
          created_at: string
          data_abertura: string
          data_conclusao: string
          data_prorrogacao: string
          descricao: string
          endereco: string
          id: string
          latitude: number
          local_nome: string
          longitude: number
          numero: string
          origem: string
          prorrogado: boolean
          secretaria_nome: string
          sigilo: string
          solicitante: string
          status: Database["public"]["Enums"]["protocolo_status"]
          tipo: Database["public"]["Enums"]["protocolo_tipo"]
          updated_at: string
        }[]
      }
      formatar_numero_esic: { Args: { p_numero: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      liberar_triagem: { Args: { p_id: string }; Returns: undefined }
      liberar_triagem_admin: { Args: { p_id: string }; Returns: undefined }
      normalizar_numero_esic: { Args: { p_numero: string }; Returns: string }
      protocolo_esic_por_numero: {
        Args: { p_numero: string }
        Returns: {
          id: string
          numero: string
          status: Database["public"]["Enums"]["protocolo_status"]
        }[]
      }
      reservar_triagem: { Args: { p_id: string }; Returns: Json }
      reservar_triagem_admin: { Args: { p_id: string }; Returns: Json }
      reverter_alteracao_1doc: {
        Args: { p_historico_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "user"
      protocolo_categoria:
        | "elogio"
        | "reclamacao"
        | "pedido_informacao"
        | "denuncia"
        | "solicitacao"
        | "outros"
        | "sugestao"
      protocolo_status: "aberto" | "em_andamento" | "concluido"
      protocolo_tipo: "ouvidoria" | "lai" | "esic"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      protocolo_categoria: [
        "elogio",
        "reclamacao",
        "pedido_informacao",
        "denuncia",
        "solicitacao",
        "outros",
        "sugestao",
      ],
      protocolo_status: ["aberto", "em_andamento", "concluido"],
      protocolo_tipo: ["ouvidoria", "lai", "esic"],
    },
  },
} as const
